package update

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// DefaultAPIURL is the GitHub "latest release" endpoint for this repo.
const DefaultAPIURL = "https://api.github.com/repos/kenshin579/mqtt-insight/releases/latest"

// Info describes an available update. JSON 태그 그대로 프론트에 전달된다.
type Info struct {
	Version       string `json:"version"`
	ReleaseURL    string `json:"releaseURL"`
	AssetURL      string `json:"assetURL"`       // "" = 플랫폼 자산 없음 → 폴백
	CanSelfUpdate bool   `json:"canSelfUpdate"` // 호출자(app.go)가 실행 환경 보고 채움
}

type release struct {
	TagName string  `json:"tag_name"`
	HTMLURL string  `json:"html_url"`
	Assets  []asset `json:"assets"`
}

type asset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
}

// Check queries apiURL for the latest release. Returns (nil, nil) when
// current is already up to date. goos는 자산 선택용(테스트 주입 가능).
func Check(ctx context.Context, apiURL, current, goos string) (*Info, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api: %s", res.Status)
	}
	var rel release
	if err := json.NewDecoder(res.Body).Decode(&rel); err != nil {
		return nil, err
	}
	if !IsNewer(current, rel.TagName) {
		return nil, nil
	}
	return &Info{
		Version:    rel.TagName,
		ReleaseURL: rel.HTMLURL,
		AssetURL:   assetFor(rel.Assets, goos),
	}, nil
}

// assetFor picks the platform's self-update asset URL ("" = none).
func assetFor(assets []asset, goos string) string {
	if goos != "darwin" { // Windows 자기교체는 후속 버전 (스펙 §6)
		return ""
	}
	for _, a := range assets {
		if strings.HasSuffix(a.Name, "-macos-universal.zip") {
			return a.URL
		}
	}
	return ""
}
