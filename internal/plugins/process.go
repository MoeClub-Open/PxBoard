package plugins

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

type Process struct {
	mu      sync.Mutex
	state   sync.RWMutex
	cmd     *exec.Cmd
	input   io.WriteCloser
	output  *json.Decoder
	token   string
	failure string
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
	p := &Process{cmd: cmd, input: in, output: json.NewDecoder(bufio.NewReader(out)), token: token}
	return p, nil
}
func (p *Process) Call(ctx context.Context, req plugin.Request) (plugin.Response, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if failure := p.Error(); failure != "" {
		return plugin.Response{}, fmt.Errorf("%s", failure)
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	ch := make(chan struct {
		res plugin.Response
		err error
	}, 1)
	go func() {
		err := json.NewEncoder(p.input).Encode(req)
		var res plugin.Response
		if err == nil {
			err = p.output.Decode(&res)
		}
		ch <- struct {
			res plugin.Response
			err error
		}{res, err}
	}()
	select {
	case result := <-ch:
		if result.err != nil {
			p.setError(result.err.Error())
		}
		return result.res, result.err
	case <-ctx.Done():
		_ = p.cmd.Process.Kill()
		p.setError("插件响应超时，请重启插件")
		return plugin.Response{}, fmt.Errorf("%s", p.Error())
	}
}
func (p *Process) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	_ = p.input.Close()
	_ = p.cmd.Process.Kill()
	_ = p.cmd.Wait()
	p.setError("已停用")
}
func (p *Process) Error() string         { p.state.RLock(); defer p.state.RUnlock(); return p.failure }
func (p *Process) setError(value string) { p.state.Lock(); defer p.state.Unlock(); p.failure = value }
