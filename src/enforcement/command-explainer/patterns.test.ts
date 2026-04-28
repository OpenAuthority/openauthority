/**
 * Command explainer pattern tests.
 *
 * Test IDs:
 *   TC-CE-01 – TC-CE-12 : git command patterns        (T35)
 *   TC-CE-13 – TC-CE-18 : npm command patterns        (T35)
 *   TC-CE-19 – TC-CE-22 : pip command patterns        (T35)
 *   TC-CE-23 – TC-CE-25 : pytest command patterns     (T35)
 *   TC-CE-26 – TC-CE-30 : docker run patterns         (T18)
 *   TC-CE-31 – TC-CE-33 : docker build patterns       (T18)
 *   TC-CE-34 – TC-CE-37 : docker exec patterns        (T18)
 */

import { describe, it, expect } from 'vitest';
import { explain } from './patterns.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function hasWarningMatching(warnings: string[], pattern: RegExp): boolean {
  return warnings.some(w => pattern.test(w));
}

function hasEffectMatching(effects: string[], pattern: RegExp): boolean {
  return effects.some(e => pattern.test(e));
}

// ── TC-CE-01 – TC-CE-12 : git ─────────────────────────────────────────────────

describe('TC-CE-01: git commit — summary', () => {
  it('produces a summary that mentions committing changes', () => {
    const result = explain('git commit -m "fix bug"');
    expect(result.summary).toMatch(/commits/i);
  });
});

describe('TC-CE-02: git commit --amend — history rewrite warning', () => {
  it('warns about rewriting history when --amend is present', () => {
    const result = explain('git commit --amend');
    expect(hasWarningMatching(result.warnings, /amend|rewrit/i)).toBe(true);
  });

  it('has no amend warning without --amend flag', () => {
    const result = explain('git commit -m "normal"');
    expect(hasWarningMatching(result.warnings, /amend/i)).toBe(false);
  });
});

describe('TC-CE-03: git push — summary', () => {
  it('produces a summary that mentions pushing to remote', () => {
    const result = explain('git push origin main');
    expect(result.summary).toMatch(/push/i);
  });
});

describe('TC-CE-04: git push --force — force-push warning', () => {
  it('warns about force push when --force is present', () => {
    const result = explain('git push --force origin main');
    expect(hasWarningMatching(result.warnings, /force/i)).toBe(true);
  });

  it('warns about force push when -f shorthand is present', () => {
    const result = explain('git push -f origin main');
    expect(hasWarningMatching(result.warnings, /force/i)).toBe(true);
  });

  it('has no force warning on a normal push', () => {
    const result = explain('git push origin main');
    expect(result.warnings).toHaveLength(0);
  });
});

describe('TC-CE-05: git pull — summary', () => {
  it('produces a summary that mentions fetching or merging from remote', () => {
    const result = explain('git pull origin main');
    expect(result.summary).toMatch(/fetch|merge|remote/i);
  });
});

describe('TC-CE-06: git clone — includes URL in summary', () => {
  it('includes the repository URL in the summary', () => {
    const result = explain('git clone https://github.com/example/repo.git');
    expect(result.summary).toMatch(/github\.com/i);
  });
});

describe('TC-CE-07: git status — summary', () => {
  it('produces a summary mentioning working tree status', () => {
    const result = explain('git status');
    expect(result.summary).toMatch(/status|working tree/i);
  });
});

describe('TC-CE-08: git diff — summary', () => {
  it('produces a summary mentioning changes', () => {
    const result = explain('git diff HEAD~1');
    expect(result.summary).toMatch(/changes|diff/i);
  });
});

describe('TC-CE-09: git log — summary', () => {
  it('produces a summary mentioning the commit log', () => {
    const result = explain('git log --oneline');
    expect(result.summary).toMatch(/log|commit/i);
  });
});

describe('TC-CE-10: git reset --hard — discard warning', () => {
  it('warns about discarding local changes with --hard', () => {
    const result = explain('git reset --hard HEAD');
    expect(hasWarningMatching(result.warnings, /discard|hard/i)).toBe(true);
  });

  it('has no discard warning on a soft reset', () => {
    const result = explain('git reset --soft HEAD~1');
    expect(hasWarningMatching(result.warnings, /discard/i)).toBe(false);
  });
});

describe('TC-CE-11: git merge — includes branch name in summary', () => {
  it('includes the branch name in the summary', () => {
    const result = explain('git merge feature/my-branch');
    expect(result.summary).toMatch(/feature\/my-branch/);
  });
});

describe('TC-CE-12: git checkout — summary', () => {
  it('produces a summary mentioning branches or working tree', () => {
    const result = explain('git checkout main');
    expect(result.summary).toMatch(/branch|restore|switch/i);
  });
});

// ── TC-CE-13 – TC-CE-18 : npm ─────────────────────────────────────────────────

describe('TC-CE-13: npm install — generic summary when no packages listed', () => {
  it('produces a generic install summary', () => {
    const result = explain('npm install');
    expect(result.summary).toMatch(/install/i);
    expect(result.summary).not.toMatch(/:/); // no package list
  });
});

describe('TC-CE-14: npm install — lists packages in summary', () => {
  it('includes named packages in the summary', () => {
    const result = explain('npm install express lodash');
    expect(result.summary).toMatch(/express/);
    expect(result.summary).toMatch(/lodash/);
  });

  it('skips flags and only includes positional package names', () => {
    const result = explain('npm install --save-dev typescript');
    expect(result.summary).toMatch(/typescript/);
    expect(result.summary).not.toMatch(/--save-dev/);
  });
});

describe('TC-CE-15: npm run — always warns about arbitrary shell execution', () => {
  it('includes a shell execution warning', () => {
    const result = explain('npm run build');
    expect(hasWarningMatching(result.warnings, /shell|arbitrary/i)).toBe(true);
  });
});

describe('TC-CE-16: npm run — includes script name in summary', () => {
  it('includes the script name in the summary', () => {
    const result = explain('npm run test:watch');
    expect(result.summary).toMatch(/test:watch/);
  });
});

describe('TC-CE-17: npm publish — warns about registry publication', () => {
  it('warns that the version cannot be unpublished', () => {
    const result = explain('npm publish');
    expect(hasWarningMatching(result.warnings, /npm|publish|version/i)).toBe(true);
  });
});

describe('TC-CE-18: npm ci — clean install summary', () => {
  it('produces a summary mentioning clean or lock file', () => {
    const result = explain('npm ci');
    expect(result.summary).toMatch(/clean|lock/i);
  });
});

// ── TC-CE-19 – TC-CE-22 : pip ─────────────────────────────────────────────────

describe('TC-CE-19: pip install — summary mentions Python packages', () => {
  it('produces a summary mentioning Python package installation', () => {
    const result = explain('pip install requests');
    expect(result.summary).toMatch(/install|Python/i);
  });
});

describe('TC-CE-20: pip3 install — matched by the same rule as pip', () => {
  it('produces the same shaped explanation for pip3 as for pip', () => {
    const pip   = explain('pip install flask');
    const pip3  = explain('pip3 install flask');
    expect(pip3.summary).toMatch(/flask/);
    expect(pip3.effects).toEqual(pip.effects);
  });
});

describe('TC-CE-21: pip install <packages> — includes package names in summary', () => {
  it('includes named packages in the summary', () => {
    const result = explain('pip install flask sqlalchemy');
    expect(result.summary).toMatch(/flask/);
    expect(result.summary).toMatch(/sqlalchemy/);
  });
});

describe('TC-CE-22: pip install -r — includes requirements file in summary', () => {
  it('includes the requirements file path in the summary', () => {
    const result = explain('pip install -r requirements.txt');
    expect(result.summary).toMatch(/requirements\.txt/);
  });
});

// ── TC-CE-23 – TC-CE-25 : pytest ──────────────────────────────────────────────

describe('TC-CE-23: pytest — summary mentions running tests', () => {
  it('produces a summary that mentions running a test suite', () => {
    const result = explain('pytest');
    expect(result.summary).toMatch(/run|test/i);
  });
});

describe('TC-CE-24: pytest <path> — includes path in summary', () => {
  it('includes the test path in the summary', () => {
    const result = explain('pytest tests/unit/');
    expect(result.summary).toMatch(/tests\/unit\//);
  });
});

describe('TC-CE-25: pytest with flags — produces valid explanation', () => {
  it('returns a summary even when only flags are present', () => {
    const result = explain('pytest -v --tb=short');
    expect(result.summary).toMatch(/run|test/i);
    expect(result.effects).toBeInstanceOf(Array);
    expect(result.warnings).toBeInstanceOf(Array);
  });
});

// ── TC-CE-26 – TC-CE-30 : docker run ─────────────────────────────────────────

describe('TC-CE-26: docker run — summary includes image name', () => {
  it('includes the image name in the summary', () => {
    const result = explain('docker run ubuntu:22.04 bash');
    expect(result.summary).toMatch(/ubuntu:22\.04/);
  });

  it('produces a summary mentioning running a container', () => {
    const result = explain('docker run nginx');
    expect(result.summary).toMatch(/run|container/i);
  });
});

describe('TC-CE-27: docker run -v /:/host — full disk access warning', () => {
  it('warns about full disk access when root is mounted', () => {
    const result = explain('docker run -v /:/host ubuntu bash');
    expect(hasWarningMatching(result.warnings, /full disk|root filesystem|full.+access/i)).toBe(true);
  });

  it('full-disk warning is absent for non-root volume mounts', () => {
    const result = explain('docker run -v /data:/data ubuntu bash');
    expect(hasWarningMatching(result.warnings, /full disk|root filesystem/i)).toBe(false);
  });
});

describe('TC-CE-28: docker run -v /data:/data — no full-disk warning', () => {
  it('does not warn about full disk access for a scoped bind mount', () => {
    const result = explain('docker run -v /var/log:/logs nginx');
    expect(hasWarningMatching(result.warnings, /full disk/i)).toBe(false);
  });
});

describe('TC-CE-29: docker run --privileged — kernel access warning', () => {
  it('warns about privileged mode when --privileged flag is present', () => {
    const result = explain('docker run --privileged ubuntu bash');
    expect(hasWarningMatching(result.warnings, /privileged|kernel/i)).toBe(true);
  });

  it('does not warn about privileges without --privileged flag', () => {
    const result = explain('docker run ubuntu bash');
    expect(hasWarningMatching(result.warnings, /privileged/i)).toBe(false);
  });
});

describe('TC-CE-30: docker run with -v /:/host and --privileged — both warnings', () => {
  it('emits both the full-disk and the privileged warning', () => {
    const result = explain('docker run -v /:/host --privileged ubuntu bash');
    expect(hasWarningMatching(result.warnings, /full disk|root filesystem/i)).toBe(true);
    expect(hasWarningMatching(result.warnings, /privileged|kernel/i)).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

// ── TC-CE-31 – TC-CE-33 : docker build ───────────────────────────────────────

describe('TC-CE-31: docker build — summary mentions building an image', () => {
  it('produces a summary mentioning building or an image', () => {
    const result = explain('docker build .');
    expect(result.summary).toMatch(/build|image/i);
  });
});

describe('TC-CE-32: docker build with explicit context path — path in summary', () => {
  it('includes the context path in the summary', () => {
    const result = explain('docker build ./services/api');
    expect(result.summary).toMatch(/services\/api/);
  });
});

describe('TC-CE-33: docker build . — default context reflected in summary', () => {
  it('includes the dot context in the summary', () => {
    const result = explain('docker build .');
    expect(result.summary).toMatch(/\./);
  });
});

// ── TC-CE-34 – TC-CE-37 : docker exec ────────────────────────────────────────

describe('TC-CE-34: docker exec — summary includes container name', () => {
  it('includes the container name in the summary', () => {
    const result = explain('docker exec my-container ls /app');
    expect(result.summary).toMatch(/my-container/);
  });

  it('produces a summary mentioning executing or container access', () => {
    const result = explain('docker exec web-app env');
    expect(result.summary).toMatch(/exec|command|container/i);
  });
});

describe('TC-CE-35: docker exec bash -c — adds inline script execution effect', () => {
  it('adds a shell script execution effect when bash -c is used', () => {
    const result = explain('docker exec my-container bash -c "echo hello"');
    expect(hasEffectMatching(result.effects, /script|inline|shell/i)).toBe(true);
  });
});

describe('TC-CE-36: docker exec sh -c — adds inline script execution effect', () => {
  it('adds a shell script execution effect when sh -c is used', () => {
    const result = explain('docker exec my-container sh -c "cat /etc/passwd"');
    expect(hasEffectMatching(result.effects, /script|inline|shell/i)).toBe(true);
  });
});

describe('TC-CE-37: docker exec without shell — no inline script effect', () => {
  it('does not add a shell script effect for a non-shell command', () => {
    const result = explain('docker exec my-container ls /var/log');
    expect(hasEffectMatching(result.effects, /inline.*script|script.*inline/i)).toBe(false);
  });
});
