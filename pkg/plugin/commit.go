package plugin

type Write struct {
	Collection string `json:"collection"`
	Record     Record `json:"record"`
}
type Emission struct {
	Type string `json:"type"`
	Data Record `json:"data"`
}

// Commit atomically saves owned records and queues events. A stable operation
// ID makes a retry return success without repeating either action.
func (c *Client) Commit(operation string, writes []Write, events ...Emission) error {
	return c.Request("POST", "/api/v1/runtime/commit", Record{"operationId": operation, "writes": writes, "events": events}, nil)
}
