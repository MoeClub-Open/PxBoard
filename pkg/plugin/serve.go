package plugin

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
)

type actorKey struct{}

func Subject(r *http.Request) Actor { a, _ := r.Context().Value(actorKey{}).(Actor); return a }
func Admin(r *http.Request) bool    { return Subject(r).Role == "admin" }
func Service(r *http.Request, id string) bool {
	a := Subject(r)
	return a.Role == "service" && a.Plugin == id
}
func Serve(handler http.Handler) error {
	reader := bufio.NewReaderSize(os.Stdin, 1024*1024)
	encoder := json.NewEncoder(os.Stdout)
	var output sync.Mutex
	var workers sync.WaitGroup
	serial := make(chan Request, 64)
	concurrent := make(chan struct{}, 16)
	paths := map[string]bool{}
	if provider, ok := handler.(interface{ ConcurrentPaths() []string }); ok {
		for _, path := range provider.ConcurrentPaths() {
			paths[path] = true
		}
	}
	run := func(req Request) {
		res := dispatch(handler, req)
		output.Lock()
		defer output.Unlock()
		if err := encoder.Encode(res); err != nil {
			fmt.Fprintln(os.Stderr, err)
		}
	}
	workers.Add(1)
	go func() {
		defer workers.Done()
		for req := range serial {
			run(req)
		}
	}()
	defer func() { close(serial); workers.Wait() }()
	for {
		line, err := reader.ReadBytes('\n')
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		var req Request
		if err = json.Unmarshal(line, &req); err != nil {
			return err
		}
		path := strings.SplitN(req.Path, "?", 2)[0]
		if req.Path == "/_health" || paths[req.Method+" "+path] {
			concurrent <- struct{}{}
			workers.Add(1)
			go func() { defer workers.Done(); defer func() { <-concurrent }(); run(req) }()
		} else {
			serial <- req
		}
	}
}
func dispatch(handler http.Handler, req Request) (res Response) {
	res.ID = req.ID
	if req.Path == "/_health" {
		res.Status = 200
		res.Headers = map[string][]string{"Content-Type": {"application/json"}}
		res.Body = []byte(`{"data":{"status":"ok","apiVersion":"1.0"}}`)
		return
	}
	defer func() {
		if e := recover(); e != nil {
			res.Status = 500
			res.Body = []byte(`{"error":{"code":"plugin_error","message":"插件处理失败"}}`)
			fmt.Fprintln(os.Stderr, e)
		}
	}()
	r := httptest.NewRequest(req.Method, "http://plugin"+req.Path, strings.NewReader(string(req.Body)))
	if req.Host != "" {
		r.Host = req.Host
	}
	r.Header = req.Headers
	if r.Header == nil {
		r.Header = http.Header{}
	}
	r = r.WithContext(context.WithValue(r.Context(), actorKey{}, req.Actor))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	res.Status = w.Code
	res.Headers = w.Header()
	res.Body = w.Body.Bytes()
	return
}
func JSON(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data})
}
func Fail(w http.ResponseWriter, status int, message string) {
	FailCode(w, status, http.StatusText(status), message)
}
func FailCode(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"code": code, "message": message}})
}
func Decode(r *http.Request, dst any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(dst)
}
