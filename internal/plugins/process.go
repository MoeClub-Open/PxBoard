package plugins

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

type processResult struct {
	response plugin.Response
	err      error
}

type Process struct {
	state    sync.RWMutex
	cmd      *exec.Cmd
	input    io.WriteCloser
	requests chan plugin.Request
	pending  map[string]chan processResult
	done     chan struct{}
	stop     sync.Once
	token    string
	failure  string
}

func start(binary, id, base string) (*Process, error) {
	cmd := exec.Command(binary)
	token := plugin.ID() + plugin.ID()
	state, err := filepath.Abs(filepath.Join(filepath.Dir(filepath.Dir(binary)), "state"))
	if err != nil {
		return nil, err
	}
	if err = os.MkdirAll(state, 0700); err != nil {
		return nil, err
	}
	cmd.Env = append(os.Environ(), "PX_PLUGIN_ID="+id, "PX_CORE_URL="+base, "PX_PLUGIN_TOKEN="+token, "PX_PLUGIN_STATE_DIR="+state)
	in, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = os.Stderr
	if err = cmd.Start(); err != nil {
		return nil, err
	}
	p := &Process{cmd: cmd, input: in, requests: make(chan plugin.Request, 64), pending: map[string]chan processResult{}, token: token, done: make(chan struct{})}
	go func() {
		encoder := json.NewEncoder(in)
		for {
			select {
			case req := <-p.requests:
				if err := encoder.Encode(req); err != nil {
					p.setError("插件通信失败，请重启插件: " + err.Error())
					return
				}
			case <-p.done:
				return
			}
		}
	}()
	go func() {
		decoder := json.NewDecoder(bufio.NewReader(out))
		for {
			var response plugin.Response
			if err := decoder.Decode(&response); err != nil {
				p.setError("插件通信已关闭，请重启插件")
				return
			}
			p.state.Lock()
			ch := p.pending[response.ID]
			delete(p.pending, response.ID)
			p.state.Unlock()
			if ch != nil {
				ch <- processResult{response: response}
			}
		}
	}()
	go func() {
		err := cmd.Wait()
		message := "插件进程已退出，请重启插件"
		if err != nil {
			message += ": " + err.Error()
		}
		p.setError(message)
		close(p.done)
	}()
	return p, nil
}

func (p *Process) Call(ctx context.Context, req plugin.Request) (plugin.Response, error) {
	return p.call(ctx, req, 30*time.Second)
}

func (p *Process) call(ctx context.Context, req plugin.Request, timeout time.Duration) (plugin.Response, error) {
	if err := ctx.Err(); err != nil {
		return plugin.Response{}, err
	}
	// A late reply is discarded by ID without terminating other requests.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), timeout)
	defer cancel()
	if req.ID == "" {
		req.ID = plugin.ID()
	}
	ch := make(chan processResult, 1)
	p.state.Lock()
	if p.failure != "" {
		failure := p.failure
		p.state.Unlock()
		return plugin.Response{}, fmt.Errorf("%s", failure)
	}
	p.pending[req.ID] = ch
	p.state.Unlock()
	defer func() { p.state.Lock(); delete(p.pending, req.ID); p.state.Unlock() }()
	select {
	case p.requests <- req:
	case <-ctx.Done():
		return plugin.Response{}, fmt.Errorf("插件请求排队超时")
	}
	select {
	case result := <-ch:
		return result.response, result.err
	case <-ctx.Done():
		return plugin.Response{}, fmt.Errorf("插件请求超时，可稍后查看操作结果")
	}
}

func (p *Process) Stop() {
	p.stop.Do(func() { p.setError("已停用"); _ = p.cmd.Process.Kill(); _ = p.input.Close() })
	<-p.done
}
func (p *Process) Error() string { p.state.RLock(); defer p.state.RUnlock(); return p.failure }
func (p *Process) setError(value string) {
	p.state.Lock()
	defer p.state.Unlock()
	if p.failure != "" {
		return
	}
	p.failure = value
	for id, ch := range p.pending {
		ch <- processResult{err: fmt.Errorf("%s", value)}
		delete(p.pending, id)
	}
}
