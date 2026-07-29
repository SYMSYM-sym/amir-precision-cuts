import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { render, compile, TemplateError, escapeHtml } from './render-templates.mjs';

describe('render-templates: interpolation', () => {
  test('escapes by default', () => {
    assert.equal(render('{{x}}', { x: 'A & B <c>' }), 'A &amp; B &lt;c&gt;');
  });

  test('triple brace is raw', () => {
    assert.equal(render('{{{x}}}', { x: '<b>hi</b>' }), '<b>hi</b>');
  });

  test('resolves dotted paths', () => {
    assert.equal(render('{{a.b.c}}', { a: { b: { c: 'deep' } } }), 'deep');
  });

  test('THROWS on an unresolved path — a typo must not render empty', () => {
    assert.throws(() => render('{{busines.name}}', { business: { name: 'X' } }), TemplateError);
  });

  test('{{?path}} opts out of strictness', () => {
    assert.equal(render('[{{?nope}}]', {}), '[]');
  });

  test('non-strict mode renders missing as empty', () => {
    assert.equal(render('[{{nope}}]', {}, { strict: false }), '[]');
  });

  test('false and null render as empty, 0 renders as 0', () => {
    assert.equal(render('{{a}}|{{b}}|{{c}}', { a: false, b: null, c: 0 }), '||0');
  });
});

describe('render-templates: conditionals', () => {
  const t = '{{#if booking.publish_phone}}CALL{{else}}NOPHONE{{/if}}';

  test('if/else on a nested boolean', () => {
    assert.equal(render(t, { booking: { publish_phone: true } }), 'CALL');
    assert.equal(render(t, { booking: { publish_phone: false } }), 'NOPHONE');
  });

  test('empty string is falsy, empty array is falsy', () => {
    assert.equal(render('{{#if x}}Y{{else}}N{{/if}}', { x: '' }), 'N');
    assert.equal(render('{{#if x}}Y{{else}}N{{/if}}', { x: [] }), 'N');
    assert.equal(render('{{#if x}}Y{{else}}N{{/if}}', { x: ['a'] }), 'Y');
  });

  test('unless inverts', () => {
    assert.equal(render('{{#unless x}}N{{/unless}}', { x: false }), 'N');
  });

  test('a missing condition throws rather than silently taking the false branch', () => {
    // This is the contact-block failure mode: {{#if booking.publish_fone}} would
    // quietly omit contact details forever.
    assert.throws(() => render('{{#if a.b}}x{{/if}}', {}), TemplateError);
  });
});

describe('render-templates: each', () => {
  const data = {
    brand: 'ACME',
    services: [
      { label: 'One', price_from: '$10' },
      { label: 'Two', price_from: '' },
      { label: 'Three', price_from: '$30' },
    ],
  };

  test('iterates a variable-length list — the thing flat substitution cannot do', () => {
    assert.equal(render('{{#each services}}[{{label}}]{{/each}}', data), '[One][Two][Three]');
  });

  test('per-item conditional omits a blank price rather than inventing one', () => {
    const t = '{{#each services}}{{label}}{{#if price_from}}={{price_from}}{{/if}};{{/each}}';
    assert.equal(render(t, data), 'One=$10;Two;Three=$30;');
  });

  test('@index/@number/@first/@last', () => {
    assert.equal(
      render('{{#each services}}{{@index}}:{{@number}}{{#if @first}}F{{/if}}{{#if @last}}L{{/if}} {{/each}}', data),
      '0:1F 1:2 2:3L ',
    );
  });

  test('outer scope is reachable without ../', () => {
    assert.equal(render('{{#each services}}{{brand}}-{{label}} {{/each}}', data), 'ACME-One ACME-Two ACME-Three ');
  });

  test('../ reaches the parent explicitly', () => {
    assert.equal(render('{{#each services}}{{../brand}} {{/each}}', data), 'ACME ACME ACME ');
  });

  test('each with an empty list falls to {{else}}', () => {
    assert.equal(render('{{#each xs}}x{{else}}EMPTY{{/each}}', { xs: [] }), 'EMPTY');
  });

  test('nested each keeps scopes straight', () => {
    const d = { groups: [{ n: 'a', items: [1, 2] }, { n: 'b', items: [3] }] };
    assert.equal(
      render('{{#each groups}}{{n}}({{#each items}}{{this}}{{/each}}){{/each}}', d),
      'a(12)b(3)',
    );
  });

  test('values inside each are escaped too', () => {
    assert.equal(render('{{#each xs}}{{this}}{{/each}}', { xs: ['<i>'] }), '&lt;i&gt;');
  });
});

describe('render-templates: partials', () => {
  test('includes a registered partial with the current scope', () => {
    const out = render('{{> hello}}', { name: 'World' }, { partials: { hello: 'Hi {{name}}' } });
    assert.equal(out, 'Hi World');
  });

  test('partial inside each sees the item scope', () => {
    const out = render(
      '{{#each xs}}{{> row}}{{/each}}',
      { xs: [{ v: 1 }, { v: 2 }] },
      { partials: { row: '<td>{{v}}</td>' } },
    );
    assert.equal(out, '<td>1</td><td>2</td>');
  });

  test('unknown partial throws and lists what is registered', () => {
    assert.throws(() => render('{{> missing}}', {}, { partials: { a: '' } }), /unknown partial/);
  });
});

describe('render-templates: parser errors are loud', () => {
  test('unclosed block', () => {
    assert.throws(() => render('{{#if x}}y', { x: 1 }), /unclosed block/);
  });
  test('mismatched close', () => {
    assert.throws(() => render('{{#if x}}y{{/each}}', { x: 1 }), /does not match/);
  });
  test('unknown helper', () => {
    assert.throws(() => render('{{#loop x}}y{{/loop}}', {}), /unknown block helper/);
  });
  test('stray close', () => {
    assert.throws(() => render('{{/if}}', {}), /no matching open tag/);
  });
});

describe('render-templates: comments and escaping helper', () => {
  test('comments are stripped', () => {
    assert.equal(render('a{{! note }}b', {}), 'ab');
  });
  test('escapeHtml covers quotes', () => {
    assert.equal(escapeHtml(`"'&<>`), '&quot;&#39;&amp;&lt;&gt;');
  });
});

describe('render-templates: compile caching does not leak scope', () => {
  test('same template, two data sets', () => {
    const fn = compile('{{a}}');
    assert.equal(fn({ a: 1 }), '1');
    assert.equal(fn({ a: 2 }), '2');
  });
});
