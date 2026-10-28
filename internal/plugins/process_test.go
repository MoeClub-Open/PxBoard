package plugins

import (
	"context"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

type protocolHandler struct{}

func (protocolHandler) ConcurrentPaths() []string { return []string{"GET /fast"} }
func (protocolHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/slow" {
		time.Sleep(150 * time.Millisecond)
	}
	_, _ = w.Write([]byte(r.URL.Path))
}
func init() {
	if os.Getenv("PX_PLUGIN_ID") == "protocol-test" {
		if err := p.Serve(protocolHandler{}); err != nil {
			os.Exit(1)
		}
		os.Exit(0)
	}
}

func TestProcessMultiplexAndLateReply(t *testing.T) {
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	process, err := start(binary, "protocol-test", "")
	if err != nil {
		t.Fatal(err)
	}
	defer process.Stop()
	started := make(chan struct{})
	late := make(chan error, 1)
	go func() {
		close(started)
		_, err := process.call(context.Background(), p.Request{Method: "POST", Path: "/slow"}, 40*time.Millisecond)
		late <- err
	}()
	<-started
	fast, err := process.Call(context.Background(), p.Request{Method: "GET", Path: "/fast"})
	if err != nil || string(fast.Body) != "/fast" {
		t.Fatal("concurrent reply mismatched", err)
	}
	if err := <-late; err == nil || !strings.Contains(err.Error(), "超时") {
		t.Fatal("expected individual request timeout", err)
	}
	if process.Error() != "" {
		t.Fatal("timeout stopped plugin", process.Error())
	}
	begin := time.Now()
	fast, err = process.Call(context.Background(), p.Request{Method: "GET", Path: "/fast"})
	if err != nil || string(fast.Body) != "/fast" || time.Since(begin) > 80*time.Millisecond {
		t.Fatal("safe request waited for timed-out mutation", err)
	}
	// This ordered request waits for the old slow request to complete; its late
	// response must never be mistaken for the new request's response.
	response, err := process.Call(context.Background(), p.Request{Method: "POST", Path: "/after"})
	if err != nil || string(response.Body) != "/after" {
		t.Fatal("late reply corrupted protocol", err)
	}
}
