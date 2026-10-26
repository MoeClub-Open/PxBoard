package main

import (
	"context"
	"encoding/json"
	"flag"
	"github.com/MoeClub-Open/PxBoard/internal/plugins"
	"github.com/MoeClub-Open/PxBoard/internal/server"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func main() {
	listen := flag.String("listen", "127.0.0.1:8080", "监听地址")
	data := flag.String("data", "data", "数据目录")
	web := flag.String("web", "web/dist", "界面目录")
	public := flag.String("public-url", "", "公开访问地址，用于来源检查")
	local := flag.String("install-local", "", "安装本地插件的 manifest.json")
	binary := flag.String("binary", "", "本地插件可执行文件")
	pluginSource := flag.String("plugin-source", env("PX_PLUGIN_SOURCE", "https://raw.githubusercontent.com/MoeClub-Open/PxBoard-Registry/main/index.json"), "模式安装使用的官方插件源")
	pluginKey := flag.String("plugin-public-key", os.Getenv("PX_PLUGIN_PUBLIC_KEY"), "默认插件源的发布公钥")
	flag.Parse()
	abs, e := filepath.Abs(*data)
	if e != nil {
		log.Fatal(e)
	}
	s, e := store.Open(filepath.Join(abs, "pxboard.db"))
	if e != nil {
		log.Fatal(e)
	}
	defer s.DB.Close()
	base := "http://" + *listen
	if strings.HasPrefix(*listen, "0.0.0.0:") {
		base = "http://127.0.0.1:" + strings.TrimPrefix(*listen, "0.0.0.0:")
	}
	m := plugins.New(s, filepath.Join(abs, "plugins"), base)
	defer m.Close()
	if *local != "" {
		b, e := os.ReadFile(*local)
		if e != nil {
			log.Fatal(e)
		}
		var manifest plugin.Manifest
		if e = json.Unmarshal(b, &manifest); e != nil {
			log.Fatal(e)
		}
		if e = m.LocalInstall(manifest, *binary); e != nil {
			log.Fatal(e)
		}
		log.Println("已安装", manifest.ID)
		return
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	m.Boot()
	app := &server.Server{Store: s, Plugins: m, Web: *web, PublicURL: *public, Secure: strings.HasPrefix(*public, "https://"), DefaultPluginSource: *pluginSource, DefaultPluginPublicKey: *pluginKey}
	srv := &http.Server{Addr: *listen, Handler: app.Handler(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second}
	go m.Work(ctx)
	go func() {
		<-ctx.Done()
		shutdown, c := context.WithTimeout(context.Background(), 10*time.Second)
		defer c()
		_ = srv.Shutdown(shutdown)
	}()
	log.Printf("PxBoard listening on http://%s", *listen)
	if e = srv.ListenAndServe(); e != nil && e != http.ErrServerClosed {
		log.Fatal(e)
	}
}
func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
