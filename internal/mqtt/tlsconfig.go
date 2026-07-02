package mqtt

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

// BuildTLSConfig constructs a *tls.Config from the connection config.
// Returns nil (no error) when the transport is not TLS-based.
func BuildTLSConfig(c ConnectionConfig) (*tls.Config, error) {
	if c.Transport != "tls" && c.Transport != "wss" {
		return nil, nil
	}
	tc := &tls.Config{InsecureSkipVerify: c.SkipVerify}

	var pool *x509.CertPool
	if c.UseSystemCAs {
		if p, err := x509.SystemCertPool(); err == nil && p != nil {
			pool = p
		}
	}
	if c.CACertPath != "" {
		pem, err := os.ReadFile(c.CACertPath)
		if err != nil {
			return nil, fmt.Errorf("read CA cert: %w", err)
		}
		if pool == nil {
			pool = x509.NewCertPool()
		}
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("failed to parse CA cert %q", c.CACertPath)
		}
	}
	tc.RootCAs = pool
	return tc, nil
}
