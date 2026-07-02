package mqtt

import "testing"

func TestBuildTLSConfigSkipVerify(t *testing.T) {
	cfg := ConnectionConfig{Transport: "tls", SkipVerify: true, UseSystemCAs: true}
	tc, err := BuildTLSConfig(cfg)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !tc.InsecureSkipVerify {
		t.Fatal("expected InsecureSkipVerify true")
	}
}

func TestBuildTLSConfigBadCAPath(t *testing.T) {
	cfg := ConnectionConfig{Transport: "tls", CACertPath: "/no/such/ca.pem"}
	if _, err := BuildTLSConfig(cfg); err == nil {
		t.Fatal("expected error for missing CA file")
	}
}
