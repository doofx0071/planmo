import { describe, expect, it } from 'vitest';
import { isSuggestionExcludedPath, redactSuggestionContent } from './suggest-policy.js';

function lineBreaks(text: string): string[] {
  return text.match(/\r\n|\r|\n/g) ?? [];
}

describe('suggestion secret policy — paths', () => {
  it('excludes environment, auth, npmrc, private-key, and certificate paths', () => {
    const excluded = [
      '.env',
      '.env.local',
      'apps/web/.env.production',
      'apps/api/.ENV',
      'apps/api/auth.json',
      '.npmrc',
      'packages/app/.npmrc.local',
      'packages/app/.npmrc-global',
      'keys/id_rsa',
      'keys/id_ed25519',
      'keys/id_ecdsa',
      '.ssh/id_ed25519',
      'certs/client.p12',
      'certs/server.crt',
      'certs/server.pem',
      'certs/client.cer',
      'keys/private.ppk',
      'keys/private_key',
      'keys/private-key',
    ];

    const eligiblePaths = excluded.filter((path) => !isSuggestionExcludedPath(path));
    expect(eligiblePaths).toEqual([]);
  });

  it('allows only explicit env and npmrc example, sample, or template suffixes', () => {
    const allowed = [
      '.env.example',
      'apps/web/.env.local.example',
      'apps/api/.env.sample',
      'apps/api/.env.template',
      '.npmrc.example',
      'packages/app/.npmrc.sample',
      'packages/app/.npmrc.template',
      'src/index.ts',
    ];

    for (const path of allowed) {
      expect(isSuggestionExcludedPath(path), path).toBe(false);
    }

    const nearMisses = [
      '.env.example.local',
      '.env.local.example.bak',
      '.npmrc.example.local',
      '.npmrc.template.backup',
    ];
    for (const path of nearMisses) {
      expect(isSuggestionExcludedPath(path), path).toBe(true);
    }
  });

  it('excludes credential directories, including selected .config stores', () => {
    const excluded = [
      'credentials/provider.json',
      'apps/secrets/settings.yml',
      'home/.ssh/config',
      'home/.aws/credentials',
      'home/.azure/profile',
      'home/.gcloud/configurations/config_default',
      'home/.kube/config',
      'home/.docker/config.json',
      'home/.gnupg/private-keys-v1.d/key.key',
      '.config/gcloud/credentials.db',
      '.config/aws/credentials',
      '.config/azure/accessTokens.json',
      '.config/gh/hosts.yml',
    ];

    for (const path of excluded) {
      expect(isSuggestionExcludedPath(path), path).toBe(true);
    }

    expect(isSuggestionExcludedPath('.config/editor/settings.json')).toBe(false);
    expect(isSuggestionExcludedPath('docs/secrets-policy.md')).toBe(false);
  });

  it('fails closed for unsafe or invalid repository-relative paths', () => {
    const unsafe = [
      '',
      '.',
      './src/index.ts',
      '../.env',
      'src/../config.json',
      '/etc/passwd',
      'C:/workspace/.env',
      '\\\\server\\share\\auth.json',
      'src\\..\\auth.json',
      'src//index.ts',
      'src/index.ts/',
      'src/\u0000index.ts',
      'src/index\n.ts',
    ];

    for (const path of unsafe) {
      expect(isSuggestionExcludedPath(path), JSON.stringify(path)).toBe(true);
    }
  });

  it('rejects DEL and every C1 control character in repository-relative paths', () => {
    const controls = Array.from({ length: 0x21 }, (_, index) => String.fromCharCode(0x7f + index));

    const eligibleCodePoints = controls
      .filter((control) => !isSuggestionExcludedPath(`src/index${control}.ts`))
      .map((control) => control.charCodeAt(0));

    expect(eligibleCodePoints).toEqual([]);
  });

  it('keeps ordinary POSIX-relative source paths eligible', () => {
    expect(isSuggestionExcludedPath('packages/app/src/index.ts')).toBe(false);
    expect(isSuggestionExcludedPath('docs/architecture.md')).toBe(false);
  });
});

describe('suggestion secret policy — content', () => {
  it('redacts synthetic provider tokens in otherwise valid source and preserves neighbors', () => {
    const providerToken = ['sk', 'ant', 'test', '0123456789abcdef0123456789abcdef'].join('-');
    const source = [
      'export function connect(endpoint: string) {',
      '  const endpointLabel = "primary";',
      `  const token = "${providerToken}";`,
      '  return endpointLabel + endpoint;',
      '}',
    ].join('\n');

    const result = redactSuggestionContent(source);

    expect(result.content).not.toContain(providerToken);
    expect(result.content).toContain('const endpointLabel = "primary";');
    expect(result.content).toContain('return endpointLabel + endpoint;');
    expect(result.redactionCount).toBe(1);
  });

  it('redacts common credential assignments and bearer tokens', () => {
    const assignedSecret = ['fixture', 'credential', 'value'].join('-');
    const bearerToken = ['synthetic', 'bearer', 'token'].join('-');
    const source = [
      `const client = { apiKey: "${assignedSecret}" };`,
      `fetch(url, { headers: { Authorization: "Bearer ${bearerToken}" } });`,
      'const displayName = "ordinary source";',
    ].join('\n');

    const result = redactSuggestionContent(source);

    expect(result.content).not.toContain(assignedSecret);
    expect(result.content).not.toContain(bearerToken);
    expect(result.content).toContain('const displayName = "ordinary source";');
    expect(result.redactionCount).toBe(2);
  });

  it('redacts a typed TypeScript credential value without masking its type', () => {
    const typedSecret = ['SYNTHETIC', 'TYPED', 'SECRET'].join('_');
    const source = `const API_KEY: string = "${typedSecret}";`;

    const result = redactSuggestionContent(source);

    expect(result.content).toBe('const API_KEY: string = "[REDACTED]";');
    expect(result.content).not.toContain(typedSecret);
    expect(result.redactionCount).toBe(1);
  });

  it('redacts a Go short-declaration token value without changing := syntax', () => {
    const goSecret = ['SYNTHETIC', 'GO', 'SECRET', 'VALUE'].join('_');
    const source = `token := "${goSecret}"`;

    const result = redactSuggestionContent(source);

    expect(result.content).toBe('token := "[REDACTED]"');
    expect(result.content).not.toContain(goSecret);
    expect(result.redactionCount).toBe(1);
  });

  it('redacts a typed Go declaration without changing its type', () => {
    const goSecret = ['SYNTHETIC', 'GO', 'TYPED', 'SECRET'].join('_');
    const source = `var token string = "${goSecret}"`;

    const result = redactSuggestionContent(source);

    expect(result.content).toBe('var token string = "[REDACTED]"');
    expect(result.content).not.toContain(goSecret);
    expect(result.redactionCount).toBe(1);
  });

  it('redacts single, double, backtick, and triple-quoted values without partial leaks', () => {
    const quotedSecret = ['SYNTHETIC', 'SECRET', 'VALUE'].join(' ');
    const tripleQuotedSecret = ['SYNTHETIC', 'TRIPLE', 'SECRET'].join(' ');
    const tripleSingleQuotedSecret = ['SYNTHETIC', 'SINGLE', 'TRIPLE'].join(' ');
    const source = [
      `const token = "${quotedSecret}";`,
      `const token = '${quotedSecret}';`,
      `const token = \`${quotedSecret}\`;`,
      `token = """${tripleQuotedSecret}\r\n${quotedSecret}""";`,
      `token = '''${tripleSingleQuotedSecret}''';`,
      'const displayName = "ordinary source";',
    ].join('\r\n');

    const result = redactSuggestionContent(source);
    const expected = [
      'const token = "[REDACTED]";',
      "const token = '[REDACTED]';",
      'const token = `[REDACTED]`;',
      'token = """[REDACTED]\r\n""";',
      "token = '''[REDACTED]''';",
      'const displayName = "ordinary source";',
    ].join('\r\n');

    expect(result.content).toBe(expected);
    expect(result.content).not.toContain(quotedSecret);
    expect(result.content).not.toContain(tripleQuotedSecret);
    expect(result.content).not.toContain(tripleSingleQuotedSecret);
    expect(lineBreaks(result.content)).toEqual(lineBreaks(source));
    expect(result.redactionCount).toBe(5);
  });

  it('does not leave suffixes after escaped triple delimiters', () => {
    const doubleQuoteSuffix = ['SYNTHETIC', 'ESCAPED', 'DOUBLE', 'SUFFIX'].join('_');
    const singleQuoteSuffix = ['SYNTHETIC', 'ESCAPED', 'SINGLE', 'SUFFIX'].join('_');
    const backslash = String.fromCharCode(92);
    const source = [
      'token = """prefix ' + backslash + '""" ' + doubleQuoteSuffix + ' after"""',
      "token = '''prefix " + backslash + "''' " + singleQuoteSuffix + " after'''",
      'export const after = true;',
    ].join('\r\n');

    const result = redactSuggestionContent(source);

    expect(result.content).toBe(
      ['token = """[REDACTED]"""', "token = '''[REDACTED]'''", 'export const after = true;'].join(
        '\r\n',
      ),
    );
    expect(result.content).not.toContain(doubleQuoteSuffix);
    expect(result.content).not.toContain(singleQuoteSuffix);
    expect(lineBreaks(result.content)).toEqual(lineBreaks(source));
    expect(result.redactionCount).toBe(2);
  });

  it('redacts nested template expressions through the outer closing backtick', () => {
    const nestedSuffix = ['SYNTHETIC', 'NESTED', 'TEMPLATE', 'SUFFIX'].join('_');
    const outerSuffix = ['SYNTHETIC', 'OUTER', 'TEMPLATE', 'SUFFIX'].join('_');
    const source =
      'const token = `prefix ${`nested ' +
      nestedSuffix +
      '`} ' +
      outerSuffix +
      '`;\r\nconst displayName = "ordinary source";';

    const result = redactSuggestionContent(source);

    expect(result.content).toBe(
      'const token = `[REDACTED]`;\r\nconst displayName = "ordinary source";',
    );
    expect(result.content).not.toContain(nestedSuffix);
    expect(result.content).not.toContain(outerSuffix);
    expect(lineBreaks(result.content)).toEqual(lineBreaks(source));
    expect(result.redactionCount).toBe(1);
  });

  it('redacts the complete bare credential scalar on its line', () => {
    const suffix = ['VALUE', 'WITH', 'SUFFIX'].join('_');
    const source = `password: SYNTHETIC ${suffix}\r\nexport const after = true;`;

    const result = redactSuggestionContent(source);

    expect(result.content).toBe('password: [REDACTED]\r\nexport const after = true;');
    expect(result.content).not.toContain(suffix);
    expect(lineBreaks(result.content)).toEqual(lineBreaks(source));
    expect(result.redactionCount).toBe(1);
  });

  it('handles long adversarial credential-like identifier runs', () => {
    const source = `${'a-'.repeat(8192)}a`;

    const result = redactSuggestionContent(source);

    expect(result).toEqual({ content: source, redactionCount: 0 });
  });

  it('preserves distinct mixed line-ending tokens when redacting multiline secrets', () => {
    const secret = ['SYNTHETIC', 'MIXED', 'NEWLINE', 'SECRET'].join('_');
    const source = `token = """${secret}\r${secret}\n${secret}"""`;

    const result = redactSuggestionContent(source);

    expect(result.content).toBe('token = """[REDACTED]\r[REDACTED]\n"""');
    expect(result.content).not.toContain(secret);
    expect(lineBreaks(result.content)).toEqual(lineBreaks(source));
    expect(result.redactionCount).toBe(1);
  });

  it('preserves CRLF, lone CR, and lone LF in order when redacting one triple-quoted secret', () => {
    const secret = ['SYNTHETIC', 'COMBINED', 'MIXED', 'LINE', 'ENDING', 'SECRET'].join('_');
    const source = 'token = """' + secret + '\r\n' + secret + '\r' + secret + '\n' + secret + '"""';
    const sourceLineBreaks = lineBreaks(source);

    const result = redactSuggestionContent(source);

    expect(sourceLineBreaks).toEqual(['\r\n', '\r', '\n']);
    expect(lineBreaks(result.content)).toEqual(sourceLineBreaks);
    expect(result.content).not.toContain(secret);
    expect(result.redactionCount).toBe(1);
  });

  it('redacts camelCase credential fields and npm auth-token assignments', () => {
    const openaiSecret = ['SYNTHETIC', 'OPENAI', 'KEY'].join('_');
    const authSecret = ['SYNTHETIC', 'AUTH', 'TOKEN'].join('_');
    const npmSecret = ['SYNTHETIC', 'NPM', 'TOKEN'].join('_');
    const source = [
      `const openaiApiKey = "${openaiSecret}";`,
      `const authToken = '${authSecret}';`,
      `//registry.npmjs.org/:_authToken=${npmSecret}`,
      'const displayName = "ordinary source";',
    ].join('\n');

    const result = redactSuggestionContent(source);

    const leakedSecrets = [openaiSecret, authSecret, npmSecret].filter((secret) =>
      result.content.includes(secret),
    );

    expect(leakedSecrets).toEqual([]);
    expect(result.content).toContain('const displayName = "ordinary source";');
    expect(result.redactionCount).toBe(3);
  });

  it('redacts a synthetic API-key shape embedded in valid code', () => {
    const githubToken = ['ghp', '0123456789abcdef0123456789abcdef'].join('_');
    const source = `export const example = "${githubToken}";\nexport const enabled = true;`;

    const result = redactSuggestionContent(source);

    expect(result.content).not.toContain(githubToken);
    expect(result.content).toContain('export const enabled = true;');
    expect(result.redactionCount).toBe(1);
  });

  it('redacts private-key PEM blocks while preserving every line break', () => {
    const begin = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    const end = ['-----END', 'PRIVATE KEY-----'].join(' ');
    const keyBody = ['MIIE', 'fixture', 'private', 'material'].join('');
    const source = [
      'const privateKey = `',
      begin,
      keyBody,
      end,
      '`;',
      'export const afterKey = true;',
    ].join('\r\n');

    const result = redactSuggestionContent(source);

    expect(result.content).not.toContain(begin);
    expect(result.content).not.toContain(keyBody);
    expect(result.content).not.toContain(end);
    expect(result.content).toContain('export const afterKey = true;');
    expect(lineBreaks(result.content)).toEqual(lineBreaks(source));
    expect(result.redactionCount).toBe(1);
  });

  it('redacts repeated unterminated PEM begin markers as one fail-closed block', () => {
    const begin = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    const source = Array.from({ length: 8192 }, () => begin).join('\n');

    const result = redactSuggestionContent(source);

    expect(result.content).not.toContain(begin);
    expect(lineBreaks(result.content)).toEqual(lineBreaks(source));
    expect(result.redactionCount).toBe(1);
  });

  it('keeps the supported multiword private-key PEM labels', () => {
    const labels = ['RSA PRIVATE KEY', 'rSa eNcRyPtEd pRiVaTe KeY', 'PGP PRIVATE KEY BLOCK'];
    const body = ['SYNTHETIC', 'PRIVATE', 'MATERIAL'].join('_');
    const source = labels
      .map((label) => `-----BEGIN ${label}-----${body}-----END ${label}-----`)
      .join('\n');

    const result = redactSuggestionContent(source);

    expect(result.content).not.toContain(body);
    expect(result.content).not.toContain('-----BEGIN');
    expect(result.content).not.toContain('-----END');
    expect(result.redactionCount).toBe(labels.length);
  });

  it('redacts through EOF when a PEM end label does not match', () => {
    const beginLabel = 'RSA PRIVATE KEY';
    const mismatchedEndLabel = 'EC PRIVATE KEY';
    const keyBody = ['SYNTHETIC', 'UNMATCHED', 'KEY', 'BODY'].join('_');
    const privateTail = ['SYNTHETIC', 'PRIVATE', 'KEY', 'TAIL'].join('_');
    const safeSuffix = 'export const afterKey = true;';
    const source = [
      `-----BEGIN ${beginLabel}-----`,
      keyBody,
      `-----END ${mismatchedEndLabel}-----`,
      privateTail,
      safeSuffix,
    ].join('\n');

    const result = redactSuggestionContent(source);

    expect(result.content).toBe('[REDACTED]\n\n\n\n');
    expect(result.content).not.toContain(keyBody);
    expect(result.content).not.toContain(privateTail);
    expect(result.content).not.toContain(safeSuffix);
    expect(result.redactionCount).toBe(1);
  });

  it('skips mismatched PEM end labels until the case-insensitive matching label', () => {
    const beginLabel = 'rSa pRiVaTe KeY';
    const mismatchedEndLabel = 'EC PRIVATE KEY';
    const matchingEndLabel = 'RSA PRIVATE KEY';
    const keyBody = ['SYNTHETIC', 'MATCHED', 'KEY', 'BODY'].join('_');
    const safeSuffix = 'export const afterKey = true;';
    const source = [
      `-----BEGIN ${beginLabel}-----`,
      keyBody,
      `-----END ${mismatchedEndLabel}-----`,
      `-----END ${matchingEndLabel}-----`,
      safeSuffix,
    ].join('\n');

    const result = redactSuggestionContent(source);

    expect(result.content).toBe(`[REDACTED]\n\n\n\n${safeSuffix}`);
    expect(result.content).not.toContain(keyBody);
    expect(result.redactionCount).toBe(1);
  });

  it('continues scanning for a valid key marker after malformed begin text', () => {
    const keyBody = ['SYNTHETIC', 'NESTED', 'PEM', 'SECRET'].join('_');
    const source =
      '-----BEGIN ignored -----BEGIN RSA PRIVATE KEY-----' +
      keyBody +
      '-----END RSA PRIVATE KEY-----';

    const result = redactSuggestionContent(source);

    expect(result.content).not.toContain(keyBody);
    expect(result.redactionCount).toBe(1);
  });

  it('leaves ordinary source unchanged and is deterministic', () => {
    const source = 'export const answer = 42;\nexport function ready() { return true; }';

    const first = redactSuggestionContent(source);
    const second = redactSuggestionContent(source);

    expect(first).toEqual({ content: source, redactionCount: 0 });
    expect(second).toEqual(first);
  });

  it('redacts a JWT-shaped token in otherwise valid source', () => {
    const jwt = [
      'eyJhbGciOiJIUzI1NiJ9',
      'eyJzdWIiOiIxMjM0NTY3ODkwIn0',
      'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    ].join('.');
    const source = `const compact = "${jwt}";\nexport const enabled = true;`;

    const result = redactSuggestionContent(source);

    expect(result.content).not.toContain(jwt);
    expect(result.content).toContain('export const enabled = true;');
    expect(result.redactionCount).toBe(1);
  });

  it('scans the adversarial eyJ shape in linear time', () => {
    const shape = (size: number): string => '_eyJ'.repeat(size) + '.' + 'A'.repeat(size);

    const started = performance.now();
    const result = redactSuggestionContent(shape(4096));
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(1000);
    expect(result.content).toBe(shape(4096));
    expect(result.redactionCount).toBe(0);

    // A quadratic scanner needs ~64x this input's time (seconds), a linear one a few ms.
    const largeStarted = performance.now();
    const large = redactSuggestionContent(shape(32768));
    const largeElapsed = performance.now() - largeStarted;

    expect(largeElapsed).toBeLessThan(1000);
    expect(large.redactionCount).toBe(0);
  });

  it('redacts a concatenated credential expression instead of leaking its tail', () => {
    const prefix = ['SYNTHETIC', 'QUOTED', 'PREFIX'].join('_');
    const suffix = ['SYNTHETIC', 'QUOTED', 'SUFFIX'].join('_');
    const source = `const token = "${prefix}" + "${suffix}";\nexport const after = true;`;

    const result = redactSuggestionContent(source);

    expect(result.content).toBe('const token = [REDACTED]\nexport const after = true;');
    expect(result.content).not.toContain(prefix);
    expect(result.content).not.toContain(suffix);
    expect(lineBreaks(result.content)).toEqual(lineBreaks(source));
    expect(result.redactionCount).toBe(1);
  });

  it('redacts an empty quoted credential prefix followed by a concatenated suffix', () => {
    const suffix = ['SYNTHETIC', 'EMPTY', 'PREFIX', 'SUFFIX'].join('_');
    const source = `const token = "" + "${suffix}";`;

    const result = redactSuggestionContent(source);

    expect(result.content).toBe('const token = [REDACTED]');
    expect(result.content).not.toContain(suffix);
    expect(result.redactionCount).toBe(1);
  });

  it('redacts a YAML block scalar credential body through its indented lines', () => {
    const secret = ['SYNTHETIC', 'BLOCK', 'SCALAR', 'SECRET'].join('_');
    const source = `password: |\n  ${secret}\nexport const after = true;`;

    const result = redactSuggestionContent(source);

    // The block header's own terminator is preserved, so the marker keeps both breaks.
    expect(result.content).toBe('password: [REDACTED]\n\nexport const after = true;');
    expect(result.content).not.toContain(secret);
    expect(lineBreaks(result.content)).toEqual(lineBreaks(source));
    expect(result.redactionCount).toBe(1);
  });

  it('redacts a Go interface{} typed credential declaration', () => {
    const goSecret = ['SYNTHETIC', 'GO', 'INTERFACE', 'SECRET'].join('_');
    const source = `var password interface{} = "${goSecret}"`;

    const result = redactSuggestionContent(source);

    expect(result.content).toBe('var password interface{} = "[REDACTED]"');
    expect(result.content).not.toContain(goSecret);
    expect(result.redactionCount).toBe(1);
  });

  it('redacts Go slice and map typed credential declarations', () => {
    const sliceSecret = ['SYNTHETIC', 'GO', 'SLICE', 'SECRET'].join('_');
    const mapSecret = ['SYNTHETIC', 'GO', 'MAP', 'SECRET'].join('_');
    const source = [
      `var token []byte = "${sliceSecret}"`,
      `var apiKey map[string]string = "${mapSecret}"`,
    ].join('\n');

    const result = redactSuggestionContent(source);

    expect(result.content).toBe(
      'var token []byte = "[REDACTED]"\nvar apiKey map[string]string = "[REDACTED]"',
    );
    expect(result.redactionCount).toBe(2);
  });

  it('fails closed when a credential field has an unsupported type form', () => {
    const goSecret = ['SYNTHETIC', 'GO', 'UNSUPPORTED', 'TYPE'].join('_');
    const source = `var password chan<- int = "${goSecret}"\nexport const after = true;`;

    const result = redactSuggestionContent(source);

    expect(result.content).not.toContain(goSecret);
    expect(result.redactionCount).toBe(1);
  });

  it('treats a malformed PEM begin line as a private-key start and redacts through EOF', () => {
    const body = ['SYNTHETIC', 'MALFORMED', 'PEM', 'BODY'].join('_');
    const safeSuffix = 'export const afterKey = true;';
    const source = `-----BEGIN PRIVATE KEY\n${body}\n-----END PRIVATE KEY-----\n${safeSuffix}`;

    const result = redactSuggestionContent(source);

    expect(result.content).not.toContain(body);
    expect(result.content).not.toContain('-----END');
    expect(result.content).not.toContain(safeSuffix);
    expect(lineBreaks(result.content)).toEqual(lineBreaks(source));
    expect(result.redactionCount).toBe(1);
  });
});
