package plugins

import (
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"testing"
)

func TestVersionEpochComparison(t *testing.T) {
	for _, tc := range []struct {
		installed string
		minimum   string
		want      bool
	}{
		{"1.6.0", ">=1!0.0.1", false},
		{"1!0.0.1", ">=1.6.0", true},
		{"1!0.0.1", ">=1!0.0.1", true},
		{"1!0.0.1", ">=1!0.0.2", false},
		{"1!0.0.1", ">=2!0.0.1", false},
		{"0.4.13", "0.4.12", true},
		{"-1!0.0.1", "0.0.1", false},
	} {
		if got := compatible(tc.installed, tc.minimum); got != tc.want {
			t.Errorf("compatible(%q, %q) = %v; want %v", tc.installed, tc.minimum, got, tc.want)
		}
	}
}

func TestCoreDevelopmentSeriesSupportsLegacyPlugins(t *testing.T) {
	if err := checkCoreVersion(plugin.Manifest{MinCoreVersion: "0.4.12"}); err != nil {
		t.Fatalf("legacy plugin should remain compatible: %v", err)
	}
	if err := checkCoreVersion(plugin.Manifest{MinCoreVersion: "1!0.0.1"}); err != nil {
		t.Fatalf("current development series should be compatible: %v", err)
	}
	if err := checkCoreVersion(plugin.Manifest{MinCoreVersion: "1!0.0.2"}); err == nil {
		t.Fatal("future core requirement must not be accepted")
	}
}
