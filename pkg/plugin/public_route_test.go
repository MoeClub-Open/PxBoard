package plugin

import "testing"

func TestPublicRoutePaths(t *testing.T) {
	route := Record{"path": "/sub", "baseUrls": "https://one.example/prefix, https://two.example"}
	paths, err := PublicRoutePaths(route)
	if err != nil || len(paths) != 2 || paths[0] != "/prefix/sub" || paths[1] != "/sub" {
		t.Fatalf("paths: %v, %v", paths, err)
	}
	for _, value := range []string{"https://user:pass@example.com", "https://example.com/../bad", "https://example.com?q=1", "https://{random}.example"} {
		route["baseUrls"] = value
		if _, err := PublicRoutePaths(route); err == nil {
			t.Fatalf("accepted %q", value)
		}
	}
	route = Record{"path": "/api"}
	if _, err := PublicRoutePaths(route); err == nil {
		t.Fatal("accepted reserved path")
	}
}
