package plugin

// A site provider owns public content. Core only serves the document, metadata
// and crawler policy, keeping public presentation optional and replaceable.
type SiteProvider struct {
	Path  string   `json:"path"`
	Modes []string `json:"modes,omitempty"`
}

type SiteContext struct {
	Content          bool   `json:"content"`
	Name             string `json:"name"`
	Mode             string `json:"mode"`
	BaseURL          string `json:"baseUrl"`
	RegistrationOpen bool   `json:"registrationOpen"`
}

type PublicSite struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	LogoURL     string `json:"logoUrl"`
	FaviconURL  string `json:"faviconUrl"`
	ImageURL    string `json:"imageUrl"`
	Indexable   bool   `json:"indexable"`
	HTML        string `json:"html,omitempty"`
	Renderer    string `json:"renderer,omitempty"`
	Data        Record `json:"data,omitempty"`
}
