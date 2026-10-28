package plugin

type Filter struct {
	Field string `json:"field"`
	Value any    `json:"value"`
	Op    string `json:"op,omitempty"`
}
type Query struct {
	Search       string   `json:"search,omitempty"`
	SearchFields []string `json:"searchFields,omitempty"`
	Collection   string   `json:"collection"`
	Filters      []Filter `json:"filters,omitempty"`
	Offset       int      `json:"offset"`
	Limit        int      `json:"limit"`
}
type QueryResult struct {
	Items []Record `json:"items"`
	Total int      `json:"total"`
}

func (c *Client) Query(query Query) (QueryResult, error) {
	var result QueryResult
	err := c.Request("POST", "/api/v1/runtime/query", query, &result)
	return result, err
}
func (c *Client) UsersByID(ids ...string) ([]Record, error) {
	if len(ids) == 0 {
		return []Record{}, nil
	}
	var result []Record
	err := c.Request("POST", "/api/v1/runtime/users/query", Record{"ids": ids}, &result)
	return result, err
}

func (c *Client) UsersByEmail(email string) ([]Record, error) {
	var result []Record
	err := c.Request("POST", "/api/v1/runtime/users/query", Record{"email": email}, &result)
	return result, err
}
