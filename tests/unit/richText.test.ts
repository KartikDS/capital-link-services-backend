import {
  isBlankRichText,
  sanitizeRichText,
  toRenderableHtml,
} from '../../src/shared/richText';

describe('sanitizeRichText', () => {
  it('keeps what the editor produces', () => {
    const html =
      '<h2>Heading</h2><p>One <strong>bold</strong>, <em>em</em>, <u>under</u> and <s>struck</s>.</p><ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>q</p></blockquote><hr>';

    expect(sanitizeRichText(html)).toBe(
      '<h2>Heading</h2><p>One <strong>bold</strong>, <em>em</em>, <u>under</u> and <s>struck</s>.</p><ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>q</p></blockquote><hr />'
    );
  });

  it('removes scripts, event handlers and javascript links', () => {
    const out = sanitizeRichText(
      '<p onclick="x()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)>'
    );

    expect(out).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(out).toContain('Hi');
  });

  it('adds rel to links that open a new tab', () => {
    expect(
      sanitizeRichText('<a href="https://example.com" target="_blank">x</a>')
    ).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>');
  });

  it('keeps latin1-safe punctuation and entity-encodes the rest', () => {
    expect(sanitizeRichText('<p>client’s – “ok” é</p>')).toBe('<p>client’s – “ok” é</p>');
    expect(sanitizeRichText('<p>ok 😀 Ω</p>')).toBe('<p>ok &#128512; &#937;</p>');
  });
});

describe('isBlankRichText', () => {
  it.each(['', '<p></p>', '<p> &nbsp; </p><p><br></p>'])('treats %j as blank', (html) => {
    expect(isBlankRichText(html)).toBe(true);
  });

  it('is not blank when there is text', () => {
    expect(isBlankRichText('<p>x</p>')).toBe(false);
  });
});

describe('toRenderableHtml', () => {
  it('is null for nothing, an empty editor and the legacy <br> placeholder', () => {
    expect(toRenderableHtml(null)).toBeNull();
    expect(toRenderableHtml('')).toBeNull();
    expect(toRenderableHtml('<p></p>')).toBeNull();
    expect(toRenderableHtml('<br>')).toBeNull();
  });

  it('turns legacy plain text into escaped paragraphs', () => {
    expect(toRenderableHtml('One & two\nline\n\nTwo < 3')).toBe(
      '<p>One &amp; two<br>line</p><p>Two &lt; 3</p>'
    );
  });

  it('sanitises markup and drops Word-only wrappers', () => {
    const out = toRenderableHtml(
      '<p class="MsoNormal"><b>Hi</b><o:p></o:p><script>x()</script></p>'
    );
    expect(out).toBe('<p>Hi</p>');
  });
});
