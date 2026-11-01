import { describe, expect, it } from "vitest"

import { describeUserAgent } from "./user-agent"

describe("describeUserAgent", () => {
  it("names the browser and the system", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
      )
    ).toBe("Chrome · macOS")
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("Safari · iOS")
  })

  it("does not mistake Edge for Chrome", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0"
      )
    ).toBe("Edge · Windows")
  })

  it("falls back for unknown or missing agents", () => {
    expect(describeUserAgent("curl/8.7.1")).toBeNull()
    expect(describeUserAgent(null)).toBeNull()
  })
})
