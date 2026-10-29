package plugin

const APIVersion = "1.0"
const CoreVersion = "0.0.1"
const CoreVersionEpoch = 1

type Manifest struct {
	ID                  string              `json:"id"`
	Name                string              `json:"name"`
	Version             string              `json:"version"`
	VersionEpoch        int                 `json:"versionEpoch,omitempty"`
	BuildRevision       int                 `json:"buildRevision,omitempty"`
	APIVersion          string              `json:"apiVersion"`
	MinCoreVersion      string              `json:"minCoreVersion,omitempty"`
	Description         string              `json:"description"`
	Category            string              `json:"category"`
	Author              string              `json:"author"`
	Homepage            string              `json:"homepage,omitempty"`
	Dependencies        map[string]string   `json:"dependencies"`
	Permissions         []string            `json:"permissions"`
	Events              []string            `json:"events,omitempty"`
	Pages               []Page              `json:"pages"`
	PublicPaths         []string            `json:"publicPaths,omitempty"`
	PublicRouteTarget   string              `json:"publicRouteTarget,omitempty"`
	ImportRules         []ImportRule        `json:"importRules,omitempty"`
	RequiredImportRules map[string][]string `json:"requiredImportRules,omitempty"`
	Summary             bool                `json:"summary,omitempty"`
	Auth                []AuthForm          `json:"auth,omitempty"`
	Capabilities        []string            `json:"capabilities,omitempty"`
	Site                *SiteProvider       `json:"site,omitempty"`
	Artifacts           map[string]string   `json:"artifacts,omitempty"`
	MigrationGuard      *MigrationGuard     `json:"migrationGuard,omitempty"`
}
type MigrationGuard struct {
	BeforeVersion    string   `json:"beforeVersion,omitempty"`
	Required         bool     `json:"required,omitempty"`
	Collections      []string `json:"collections"`
	PendingEvents    []string `json:"pendingEvents,omitempty"`
	MarkerCollection string   `json:"markerCollection"`
	MarkerID         string   `json:"markerId"`
	Message          string   `json:"message"`
}
type AuthForm struct {
	Modes      []string          `json:"modes,omitempty"`
	Key        string            `json:"key"`
	Title      string            `json:"title"`
	Path       string            `json:"path"`
	Fields     []Field           `json:"fields"`
	Query      map[string]string `json:"query,omitempty"`
	Capability string            `json:"capability,omitempty"`
}
type Page struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Icon       string      `json:"icon"`
	Group      string      `json:"group"`
	Roles      []string    `json:"roles"`
	Surface    string      `json:"surface,omitempty"`
	Capability string      `json:"capability,omitempty"`
	Shared     *SharedPage `json:"shared,omitempty"`
}
type SharedPage struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	SelectorLabel string `json:"selectorLabel,omitempty"`
}
type Actor struct {
	ID     string `json:"id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	Plugin string `json:"plugin,omitempty"`
	Scope  string `json:"scope,omitempty"`
}
type Request struct {
	Host    string              `json:"host,omitempty"`
	ID      string              `json:"id"`
	Method  string              `json:"method"`
	Path    string              `json:"path"`
	Headers map[string][]string `json:"headers"`
	Body    []byte              `json:"body"`
	Actor   Actor               `json:"actor"`
}
type Response struct {
	ID      string              `json:"id"`
	Status  int                 `json:"status"`
	Headers map[string][]string `json:"headers"`
	Body    []byte              `json:"body"`
}
type Record map[string]any
type Field struct {
	Key             string              `json:"key"`
	Label           string              `json:"label"`
	Type            string              `json:"type,omitempty"`
	Required        bool                `json:"required,omitempty"`
	Options         []Option            `json:"options,omitempty"`
	OptionsEndpoint string              `json:"optionsEndpoint,omitempty"`
	OptionsSearch   bool                `json:"optionsSearch,omitempty"`
	Default         any                 `json:"default,omitempty"`
	Hint            string              `json:"hint,omitempty"`
	ReadOnly        bool                `json:"readOnly,omitempty"`
	When            map[string][]string `json:"when,omitempty"`
}
type Option struct {
	Label string `json:"label"`
	Value any    `json:"value"`
}
type Action struct {
	Key      string              `json:"key"`
	Label    string              `json:"label"`
	Confirm  string              `json:"confirm,omitempty"`
	Fields   []Field             `json:"fields,omitempty"`
	Danger   bool                `json:"danger,omitempty"`
	Endpoint string              `json:"endpoint,omitempty"`
	Bind     map[string]string   `json:"bind,omitempty"`
	When     map[string][]string `json:"when,omitempty"`
}
type Resource struct {
	Filters             []Field           `json:"filters,omitempty"`
	Settings            *ResourceSettings `json:"settings,omitempty"`
	Paginated           bool              `json:"paginated,omitempty"`
	Singleton           bool              `json:"singleton,omitempty"`
	PollIntervalSeconds int               `json:"pollIntervalSeconds,omitempty"`
	Key                 string            `json:"key"`
	Title               string            `json:"title"`
	Endpoint            string            `json:"endpoint"`
	Columns             []Field           `json:"columns"`
	Fields              []Field           `json:"fields,omitempty"`
	CreateLabel         string            `json:"createLabel,omitempty"`
	Editable            bool              `json:"editable,omitempty"`
	Deletable           bool              `json:"deletable,omitempty"`
	Actions             []Action          `json:"actions,omitempty"`
	Empty               string            `json:"empty,omitempty"`
	Renderer            string            `json:"renderer,omitempty"`
}
type ResourceSettings struct {
	Title    string  `json:"title"`
	Endpoint string  `json:"endpoint"`
	Fields   []Field `json:"fields"`
}
type Metric struct {
	Label string `json:"label"`
	Value any    `json:"value"`
	Unit  string `json:"unit,omitempty"`
}
type View struct {
	Title     string     `json:"title"`
	Notice    string     `json:"notice,omitempty"`
	Metrics   []Metric   `json:"metrics,omitempty"`
	Resources []Resource `json:"resources"`
}
type Event struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Source    string `json:"source"`
	Data      Record `json:"data"`
	CreatedAt string `json:"createdAt"`
}
