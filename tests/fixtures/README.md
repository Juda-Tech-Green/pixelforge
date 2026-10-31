# Golden policy

`valid.sprite.json` is a hand-authored 2×2 fixture: opaque red, transparent, half-alpha green, opaque red. `golden.rgba.json` lists the exact expected 16 decoded RGBA bytes. The exporter test decodes PNG through Sharp and compares every byte to this stable fixture, independently of PNG compression or metadata. Do not regenerate the golden from the renderer under test. Changes to these values require an intentional format/rendering change and review.

`invalid.sprite.json` deliberately refers to an absent palette entry, exercising cross-field runtime validation beyond structural JSON Schema.
