package plugin

// CreateUserWithRecord atomically creates a member and one initial record in
// the calling plugin's own collection. The core sets the record's userId.
func (c *Client) CreateUserWithRecord(email, name, password, collection string, record Record) (string, error) {
	var out Record
	err := c.Request("POST", "/api/v1/runtime/users", Record{
		"email": email, "name": name, "password": password,
		"initialRecord": Record{"collection": collection, "data": record},
	}, &out)
	return Text(out, "id"), err
}
