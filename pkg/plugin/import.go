package plugin

import "encoding/json"

type ImportRule struct {
	Collection string   `json:"collection"`
	Required   []string `json:"required,omitempty"`
	Unique     []string `json:"unique,omitempty"`
	UserField  string   `json:"userField,omitempty"`
}

type ImportUser struct {
	ID                string `json:"id"`
	Email             string `json:"email"`
	Name              string `json:"name"`
	Password          string `json:"password"`
	PasswordAlgorithm string `json:"passwordAlgorithm"`
	PasswordSalt      string `json:"passwordSalt,omitempty"`
	MFASecret         string `json:"mfaSecret,omitempty"`
	Role              string `json:"role"`
	Status            string `json:"status"`
	CreatedAt         string `json:"createdAt"`
}
type ImportRow struct {
	Kind       string          `json:"kind"`
	Namespace  string          `json:"namespace"`
	Collection string          `json:"collection"`
	ID         string          `json:"id"`
	Data       json.RawMessage `json:"data"`
}
type ImportReport struct {
	ID        string   `json:"id"`
	Status    string   `json:"status"`
	Rows      int      `json:"rows"`
	Users     int      `json:"users"`
	Documents int      `json:"documents"`
	Errors    []string `json:"errors"`
}
