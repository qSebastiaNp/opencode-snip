import { describe, it, expect, beforeEach } from "vitest"
import { createToolExecuteBefore, hasSnipSubcommands } from "./index"

const mockedWrap = async () => true

describe("toolExecuteBefore", () => {
  let mockInput: { tool: string; sessionID: string; callID: string }
  let mockOutput: { args: { command: string } }

  beforeEach(() => {
    mockInput = { tool: "bash", sessionID: "s", callID: "c" }
    mockOutput = { args: { command: "" } }
  })

  it("should prefix simple command with snip run --", async () => {
    mockOutput.args.command = "go test ./..."
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip run -- go test ./...")
  })

  it("should handle command with one env var prefix", async () => {
    mockOutput.args.command = "CGO_ENABLED=0 go test ./..."
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("CGO_ENABLED=0 snip run -- go test ./...")
  })

  it("should handle command with multiple env var prefixes", async () => {
    mockOutput.args.command = "CGO_ENABLED=0 GOOS=linux go test ./..."
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("CGO_ENABLED=0 GOOS=linux snip run -- go test ./...")
  })

  it("should handle command with &&", async () => {
    mockOutput.args.command = "go test && go build"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip run -- go test && snip run -- go build")
  })

  it("should handle command with |", async () => {
    mockOutput.args.command = "git log | head"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip run -- git log | snip run -- head")
  })

  it("should handle command with |&", async () => {
    mockOutput.args.command = "cmd1 |& cmd2"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip run -- cmd1 |& snip run -- cmd2")
  })

  it("should handle command with ;", async () => {
    mockOutput.args.command = "go test; go build"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip run -- go test; snip run -- go build")
  })

  it("should handle command with ||", async () => {
    mockOutput.args.command = "test -f foo.txt || echo missing"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip run -- test -f foo.txt || snip run -- echo missing")
  })

  it("should handle command with &", async () => {
    mockOutput.args.command = "sleep 1 & sleep 2 &"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip run -- sleep 1 & snip run -- sleep 2 &")
  })

  it("should not treat &> as background operator", async () => {
    mockOutput.args.command = "cmd &> out.log"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip run -- cmd &> out.log")
  })

  it("should handle mixed operators", async () => {
    mockOutput.args.command = "go test && go build; go run"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip run -- go test && snip run -- go build; snip run -- go run")
  })

  it("should handle env vars with operators", async () => {
    mockOutput.args.command = "FOO=bar go test && go build"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("FOO=bar snip run -- go test && snip run -- go build")
  })

  it("should not double prefix already prefixed command", async () => {
    mockOutput.args.command = "snip run -- go test"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip run -- go test")
  })

  it("should not modify non-bash tool calls", async () => {
    mockInput.tool = "read"
    mockOutput.args.command = "go test"
    await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("go test")
  })

  describe("subcommand passthrough", () => {
    it("should pass each pipe segment to shouldWrap", async () => {
      const called: string[] = []
      const spy = async (c: string) => { called.push(c); return true }
      mockOutput.args.command = "git log | head"
      await createToolExecuteBefore(spy)(mockInput, mockOutput)
      expect(called).toEqual(["git log", "head"])
    })

    it("should pass each && segment to shouldWrap", async () => {
      const called: string[] = []
      const spy = async (c: string) => { called.push(c); return true }
      mockOutput.args.command = "cd /tmp && go test"
      await createToolExecuteBefore(spy)(mockInput, mockOutput)
      expect(called).toEqual(["cd /tmp", "go test"])
    })

    it("should pass mixed operator segments to shouldWrap", async () => {
      const called: string[] = []
      const spy = async (c: string) => { called.push(c); return true }
      mockOutput.args.command = "go test && go build; go run"
      await createToolExecuteBefore(spy)(mockInput, mockOutput)
      expect(called).toEqual(["go test", "go build", "go run"])
    })

    it("should not call shouldWrap for already prefixed command", async () => {
      const called: string[] = []
      const spy = async (c: string) => { called.push(c); return true }
      mockOutput.args.command = "snip run -- go test"
      await createToolExecuteBefore(spy)(mockInput, mockOutput)
      expect(called).toEqual([])
    })

    it("should not call shouldWrap for already prefixed segments in compound command", async () => {
      const called: string[] = []
      const spy = async (c: string) => { called.push(c); return true }
      mockOutput.args.command = "cd /tmp && snip run -- go test"
      await createToolExecuteBefore(spy)(mockInput, mockOutput)
      expect(called).toEqual(["cd /tmp"])
    })
  })

  describe("redirections with &", () => {
    it("should not break 2>&1 redirection", async () => {
      mockOutput.args.command = 'find / -name "*.log" 2>&1'
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe('snip run -- find / -name "*.log" 2>&1')
    })

    it("should not break 1>&2 redirection", async () => {
      mockOutput.args.command = "cmd 1>&2"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cmd 1>&2")
    })

    it("should handle 2>&1 with pipe", async () => {
      mockOutput.args.command = 'find / -name "*.log" 2>&1 | grep error'
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe('snip run -- find / -name "*.log" 2>&1 | snip run -- grep error')
    })

    it("should handle 2>&1 with chained commands", async () => {
      mockOutput.args.command = "cmd1 2>&1 && cmd2"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cmd1 2>&1 && snip run -- cmd2")
    })

    it("should not treat &> as background operator", async () => {
      mockOutput.args.command = "cmd &> out.log"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cmd &> out.log")
    })

    it("should not treat &> in compound command as background", async () => {
      mockOutput.args.command = "cmd1 &> out.log && cmd2"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cmd1 &> out.log && snip run -- cmd2")
    })
  })

  describe("pipe expressions with quotes", () => {
    it("should not split pipes inside single quotes", async () => {
      mockOutput.args.command = "cat file.json | jq '.content | .text'"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cat file.json | snip run -- jq '.content | .text'")
    })

    it("should not split pipes inside double quotes", async () => {
      mockOutput.args.command = 'cat file.json | jq ".content | .text"'
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe('snip run -- cat file.json | snip run -- jq ".content | .text"')
    })

    it("should handle jq with fromjson", async () => {
      mockOutput.args.command = "cat file.json | jq '.content[0].text | fromjson'"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cat file.json | snip run -- jq '.content[0].text | fromjson'")
    })

    it("should handle multiple pipes in jq", async () => {
      mockOutput.args.command = "cat file.json | jq '.a | .b | .c'"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cat file.json | snip run -- jq '.a | .b | .c'")
    })

    it("should handle pipe with || operator", async () => {
      mockOutput.args.command = "cmd1 || cmd2"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cmd1 || snip run -- cmd2")
    })

    it("should handle mixed quotes and pipes", async () => {
      mockOutput.args.command = 'echo "hello | world" | cat'
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe('snip run -- echo "hello | world" | snip run -- cat')
    })

    it("should preserve |& operator between pipe segments", async () => {
      mockOutput.args.command = "cmd1 |& cmd2"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cmd1 |& snip run -- cmd2")
    })
  })

  describe("error guard", () => {
    it("should leave command unmodified when shouldWrap throws", async () => {
      const throwWrap = async () => { throw new Error("boom") }
      mockOutput.args.command = "go test ./..."
      await createToolExecuteBefore(throwWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("go test ./...")
    })

    it("should leave command unmodified when shouldWrap throws for compound commands", async () => {
      const throwWrap = async () => { throw new Error("boom") }
      mockOutput.args.command = "go test && go build"
      await createToolExecuteBefore(throwWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("go test && go build")
    })
  })

  describe("mixed wrapping in compound commands", () => {
    it("should wrap only segments that shouldWrap approves", async () => {
      const selectiveWrap = async (cmd: string) => !cmd.startsWith("cd ")
      mockOutput.args.command = "cd /tmp && go test"
      await createToolExecuteBefore(selectiveWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("cd /tmp && snip run -- go test")
    })

    it("should skip all segments when shouldWrap always returns false", async () => {
      const neverWrap = async () => false
      mockOutput.args.command = "go test && go build"
      await createToolExecuteBefore(neverWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("go test && go build")
    })
  })

  describe("snip prefix deduplication (PR #17)", () => {
    it("should strip single snip prefix and re-add snip run --", async () => {
      mockOutput.args.command = "snip go test"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- go test")
    })

    it("should strip multiple snip prefixes", async () => {
      mockOutput.args.command = "snip snip snip go test"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- go test")
    })

    it("should deduplicate snip in chained commands", async () => {
      mockOutput.args.command = "snip go test && snip go build"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- go test && snip run -- go build")
    })

    it("should deduplicate snip with env var prefix", async () => {
      mockOutput.args.command = "FOO=bar snip go test"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("FOO=bar snip run -- go test")
    })

    it("should deduplicate snip in pipe chain", async () => {
      mockOutput.args.command = "snip git log | head"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- git log | snip run -- head")
    })
  })

  describe("PowerShell support (PR #21)", () => {
    it("should skip PowerShell env var assignment", async () => {
      mockOutput.args.command = "$env:CI='true'"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("$env:CI='true'")
    })

    it("should skip PowerShell variable assignment", async () => {
      mockOutput.args.command = "$x = 1"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("$x = 1")
    })

    it("should skip Write-Output cmdlet", async () => {
      mockOutput.args.command = "Write-Output 'hello'"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("Write-Output 'hello'")
    })

    it("should skip Get-ChildItem cmdlet", async () => {
      mockOutput.args.command = "Get-ChildItem ."
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("Get-ChildItem .")
    })

    it("should skip Remove-Item cmdlet", async () => {
      mockOutput.args.command = "Remove-Item -Recurse -Force dir"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("Remove-Item -Recurse -Force dir")
    })

    it("should skip ForEach-Object cmdlet (camelCase verb)", async () => {
      mockOutput.args.command = "ForEach-Object { $_.Name }"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("ForEach-Object { $_.Name }")
    })

    it("should skip ConvertTo-Json cmdlet (camelCase verb)", async () => {
      mockOutput.args.command = "ConvertTo-Json -Depth 5"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("ConvertTo-Json -Depth 5")
    })

    it("should skip PowerShell call operator (&)", async () => {
      mockOutput.args.command = "& 'C:\\Program Files\\tool.exe'"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("& 'C:\\Program Files\\tool.exe'")
    })

    it("should skip PowerShell splatting (@args)", async () => {
      mockOutput.args.command = "@args"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("@args")
    })

    it("should skip PowerShell array literal (@())", async () => {
      mockOutput.args.command = '@("a","b")'
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe('@("a","b")')
    })

    it("should skip env var but snip chained command", async () => {
      const selectiveWrap = async (cmd: string) => !cmd.startsWith("$")
      mockOutput.args.command = "$env:CI='true'; git log -1"
      await createToolExecuteBefore(selectiveWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("$env:CI='true'; snip run -- git log -1")
    })

    it("should skip cmdlet but snip chained command", async () => {
      const selectiveWrap = async (cmd: string) => !cmd.startsWith("Write")
      mockOutput.args.command = "Write-Output 'test'; git log -1"
      await createToolExecuteBefore(selectiveWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("Write-Output 'test'; snip run -- git log -1")
    })

    it("should handle mixed PowerShell env vars and commands", async () => {
      const selectiveWrap = async (cmd: string) =>
        !cmd.startsWith("$") && !cmd.startsWith("cd")
      mockOutput.args.command = "$env:CI='true'; $env:GIT_PAGER='cat'; cd 'C:\\Projects'; git log -1"
      await createToolExecuteBefore(selectiveWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("$env:CI='true'; $env:GIT_PAGER='cat'; cd 'C:\\Projects'; snip run -- git log -1")
    })
  })

  describe("Unix commands not matching cmdlet regex", () => {
    const isWin32 = process.platform === "win32"

    it.skipIf(isWin32)("should wrap apt-get (not matched as cmdlet on non-Windows)", async () => {
      mockOutput.args.command = "apt-get install foo"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- apt-get install foo")
    })

    it.skipIf(isWin32)("should wrap node-gyp (not matched as cmdlet on non-Windows)", async () => {
      mockOutput.args.command = "node-gyp rebuild"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- node-gyp rebuild")
    })

    it.skipIf(isWin32)("should wrap pkg-config (not matched as cmdlet on non-Windows)", async () => {
      mockOutput.args.command = "pkg-config --libs openssl"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- pkg-config --libs openssl")
    })
  })

  describe("newline splitting (PR #21)", () => {
    it("should split and snip commands separated by newlines", async () => {
      mockOutput.args.command = "git log\ngit status"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- git log\nsnip run -- git status")
    })

    it("should handle newline after unproxyable command", async () => {
      const selectiveWrap = async (cmd: string) => !cmd.startsWith("cd ")
      mockOutput.args.command = "cd /tmp\ngit log"
      await createToolExecuteBefore(selectiveWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("cd /tmp\nsnip run -- git log")
    })

    it("should handle mixed newlines and operators", async () => {
      const selectiveWrap = async (cmd: string) => !cmd.startsWith("cd ")
      mockOutput.args.command = "cd /tmp\ngit log && git status"
      await createToolExecuteBefore(selectiveWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("cd /tmp\nsnip run -- git log && snip run -- git status")
    })

    it("should handle pipe within newline-separated commands", async () => {
      const selectiveWrap = async (cmd: string) => !cmd.startsWith("cd ")
      mockOutput.args.command = "cd /tmp\ngit log | head"
      await createToolExecuteBefore(selectiveWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("cd /tmp\nsnip run -- git log | snip run -- head")
    })

    it("should handle PowerShell prelude with newlines", async () => {
      const selectiveWrap = async (cmd: string) =>
        !cmd.startsWith("$") && !cmd.startsWith("cd")
      mockOutput.args.command = "$env:CI='true'; cd 'C:\\Projects'\ngit show abc123"
      await createToolExecuteBefore(selectiveWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("$env:CI='true'; cd 'C:\\Projects'\nsnip run -- git show abc123")
    })
  })

  describe("heredoc safety (PR #21)", () => {
    it("should not split heredoc body on newlines", async () => {
      mockOutput.args.command = "cat <<EOF\nhello world\nEOF"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cat <<EOF\nhello world\nEOF")
    })

    it("should not split heredoc with quoted delimiter", async () => {
      mockOutput.args.command = "cat <<'EOF'\nhello world\nEOF"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cat <<'EOF'\nhello world\nEOF")
    })

    it("should not split pipes inside heredoc body", async () => {
      mockOutput.args.command = "cat <<EOF\nleft | right\nEOF"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cat <<EOF\nleft | right\nEOF")
    })

    it("should still split operators when heredoc is present", async () => {
      mockOutput.args.command = "cat <<EOF\ndata\nEOF && echo done"
      await createToolExecuteBefore(mockedWrap)(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("snip run -- cat <<EOF\ndata\nEOF && snip run -- echo done")
    })
  })
})

describe("hasSnipSubcommands", () => {
  it("should return true when snip check succeeds", async () => {
    const mock$ = ((..._args: any[]) => ({
      nothrow: () => ({
        quiet: async () => ({ exitCode: 0 }),
      }),
    })) as any
    expect(await hasSnipSubcommands(mock$)).toBe(true)
  })

  it("should return true even when snip check exits non-zero", async () => {
    const mock$ = ((..._args: any[]) => ({
      nothrow: () => ({
        quiet: async () => ({ exitCode: 1 }),
      }),
    })) as any
    expect(await hasSnipSubcommands(mock$)).toBe(true)
  })

  it("should return false when snip check subcommand is missing", async () => {
    const mock$ = ((..._args: any[]) => ({
      nothrow: () => ({
        quiet: async () => { throw new Error("not found") },
      }),
    })) as any
    expect(await hasSnipSubcommands(mock$)).toBe(false)
  })
})
