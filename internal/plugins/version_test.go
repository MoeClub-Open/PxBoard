package plugins

import "testing"

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
