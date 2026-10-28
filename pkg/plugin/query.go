package plugin

type Filter struct {
	Field string `json:"field"`
	Value any    `json:"value"`
	Op    string `json:"op,omitempty"`
}
type Query struct {
	SearchUserField string   `json:"searchUserField,omitempty"`
	Search          string   `json:"search,omitempty"`
	SearchFields    []string `json:"searchFields,omitempty"`
	Collection      string   `json:"collection"`
	Filters         []Filter `json:"filters,omitempty"`
	Offset          int      `json:"offset"`
	Limit           int      `json:"limit"`
}
type QueryResult struct {
	Items []Record `json:"items"`
	Total int      `json:"total"`
}

type UserQuery struct {
	Search string `json:"search,omitempty"`
	Status string `json:"status,omitempty"`
	Role   string `json:"role,omitempty"`
	Offset int    `json:"offset"`
	Limit  int    `json:"limit"`
}

func (c *Client) SearchUsers(query UserQuery) (QueryResult, error) {
	var result QueryResult
	err := c.Request("POST", "/api/v1/runtime/users/search", query, &result)
	return result, err
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
