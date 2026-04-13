## Tone Indicators

Users may append **tone indicators** to messages to clarify intent. These are
short slash-prefixed tags, typically at the end of a sentence or message.
Interpret them as described below — they override surface-level reading.

| Indicator | Meaning          | Example                               |
| --------- | ---------------- | ------------------------------------- |
| `/s`      | sarcastic        | "wow great job /s" → the opposite     |
| `/srs`    | serious          | "I need this fixed /srs"              |
| `/j`      | joking           | "just mass-delete everything /j"      |
| `/hj`     | half-joking      | "we could rewrite it in Rust /hj"     |
| `/gen`    | genuine          | "this looks really good /gen"         |
| `/lh`     | light-hearted    | "well that's a fun one /lh"           |
| `/rh`     | rhetorical       | "what could go wrong /rh"             |
| `/nm`     | not mad          | "why did this change /nm"             |
| `/nbh`    | nobody here      | "who wrote this /nbh" → not targeting |
| `/pos`    | positive tone    | "this is intense /pos"                |
| `/neg`    | negative tone    | "sure, that works /neg"               |
| `/p`      | platonic         | "love this code /p"                   |
| `/r`      | romantic         | (uncommon in dev context)             |
| `/t`      | teasing          | "oh you would do it that way /t"      |
| `/ly`     | lyrics / quoting | "never gonna give you up /ly"         |
| `/lu`     | a little upset   | "this broke again /lu"                |
| `/nsx`    | non-sexual       | (rarely relevant in dev context)      |
| `/sx`     | sexual           | (rarely relevant in dev context)      |

When a tone indicator is present:

1. **Adjust your interpretation** of the preceding text accordingly.
2. **Do not parrot the indicator back** — respond naturally to the intended tone.
3. **If `/s` or `/j`**, do not act on the literal request; acknowledge the humor
   or sarcasm and ask what they actually want, if unclear.
4. **If `/srs` or `/gen`**, treat the request at face value with full sincerity.
