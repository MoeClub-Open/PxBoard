package plugin

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

type Client struct {
	BaseURL, Token string
	HTTP           *http.Client
}

type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string { return fmt.Sprintf("%s (%d)", e.Message, e.Status) }

func NewClient() *Client {
	return &Client{os.Getenv("PX_CORE_URL"), os.Getenv("PX_PLUGIN_TOKEN"), &http.Client{Timeout: 20 * time.Second}}
}
func ID() string { b := make([]byte, 16); _, _ = rand.Read(b); return hex.EncodeToString(b) }
func (c *Client) Request(method, path string, body any, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	r, err := http.NewRequest(method, c.BaseURL+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	r.Header.Set("Authorization", "Bearer "+c.Token)
	r.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(r)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return err
	}
	if res.StatusCode >= 400 {
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(data, &e)
		return &APIError{Status: res.StatusCode, Message: e.Error.Message}
	}
	if out != nil {
		var wrap struct {
			Data json.RawMessage `json:"data"`
		}
		if err = json.Unmarshal(data, &wrap); err != nil {
			return err
		}
		return json.Unmarshal(wrap.Data, out)
	}
	return nil
}
func (c *Client) List(collection string) ([]Record, error) {
	var out []Record
	err := c.Request("GET", "/api/v1/runtime/data/"+url.PathEscape(collection), nil, &out)
	return out, err
}

func (c *Client) Get(collection, id string) (Record, error) {
	var record Record
	err := c.Request("GET", "/api/v1/runtime/data/"+url.PathEscape(collection)+"/"+url.PathEscape(id), nil, &record)
	return record, err
}
func (c *Client) Put(collection string, record Record) error {
	if record["id"] == nil {
		record["id"] = ID()
	}
	return c.Request("PUT", "/api/v1/runtime/data/"+url.PathEscape(collection)+"/"+url.PathEscape(Text(record, "id")), record, nil)
}
func (c *Client) Delete(collection, id string) error {
	return c.Request("DELETE", "/api/v1/runtime/data/"+url.PathEscape(collection)+"/"+url.PathEscape(id), nil, nil)
}
func (c *Client) Call(id, method, path string, body, out any) error {
	return c.Request(method, "/api/v1/extensions/"+id+path, body, out)
}
func (c *Client) Emit(kind string, data Record) error {
	return c.Request("POST", "/api/v1/runtime/events", Record{"type": kind, "data": data}, nil)
}
func (c *Client) Users() ([]Record, error) {
	var out []Record
	err := c.Request("GET", "/api/v1/runtime/users", nil, &out)
	return out, err
}
func (c *Client) Increment(collection, id, field string, amount float64, operation string) error {
	return c.Request("POST", "/api/v1/runtime/increment", Record{"collection": collection, "id": id, "field": field, "amount": amount, "operationId": operation}, nil)
}
func Text(r Record, k string) string { s, _ := r[k].(string); return s }
func Number(r Record, k string) float64 {
	switch n := r[k].(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case uint64:
		return float64(n)
	case json.Number:
		value, _ := n.Float64()
		return value
	}
	return 0
}
func Bool(r Record, k string) bool { b, _ := r[k].(bool); return b }
