package plugin

// PutMany writes records in the same collection as one transaction.
func (c *Client) PutMany(collection string, records []Record) error {
	for _, record := range records {
		if record["id"] == nil {
			record["id"] = ID()
		}
	}
	return c.Request("POST", "/api/v1/runtime/batch", Record{"collection": collection, "records": records}, nil)
}
