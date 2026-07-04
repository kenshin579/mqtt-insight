package update

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
)

// download fetches url into dest, reporting progress 0–100.
// Content-Length가 없으면 진행률 콜백은 호출되지 않는다(베스트 에포트).
func download(ctx context.Context, url, dest string, progress func(int)) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("download: %s", res.Status)
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	var written int64
	total := res.ContentLength
	lastPct := -1 // 같은 %를 반복 emit하지 않기 위한 dedup
	buf := make([]byte, 128*1024)
	for {
		n, rerr := res.Body.Read(buf)
		if n > 0 {
			if _, werr := out.Write(buf[:n]); werr != nil {
				return werr
			}
			written += int64(n)
			if total > 0 && progress != nil {
				if pct := int(written * 100 / total); pct != lastPct {
					lastPct = pct
					progress(pct)
				}
			}
		}
		if rerr == io.EOF {
			return nil
		}
		if rerr != nil {
			return rerr
		}
	}
}
