export const DEFAULT_PROMPT_TEMPLATE = `Between A and B, which do you prefer?

<A>
{{A}}
</A>
<B>
{{B}}
</B>

if -50 is strongly prefer A, and 50 is strongly prefer B, then your answer should be a number between -50 and 50.
respond with some reasoning and your score. Your score will be read by this regex: /SCORE: (-?\\d+)/`;

export const PROMPT_TEMPLATES = [
  {
    label: "Pure Preference",
    template: DEFAULT_PROMPT_TEMPLATE
  },
  {
    label: "Aesthetic Soul",
    template: `Which resonates more deeply with your aesthetic sensibility?

<A>
{{A}}
</A>
<B>
{{B}}
</B>

Consider beauty, elegance, and emotional resonance. Express your preference from -50 (strongly A) to 50 (strongly B).
Meditate on your choice and explain. Your score will be read by: /SCORE: (-?\\d+)/`
  },
  {
    label: "Pragmatic Mind", 
    template: `From a purely practical standpoint, which serves humanity better?

<A>
{{A}}
</A>
<B>
{{B}}
</B>

Consider utility, efficiency, and real-world impact. Rate from -50 (strongly A) to 50 (strongly B).
Explain your reasoning. Your score will be read by: /SCORE: (-?\\d+)/`
  },
  {
    label: "Innovative Spirit",
    template: `Which represents more groundbreaking innovation?

<A>
{{A}}
</A>
<B>
{{B}}
</B>

Consider originality, potential impact, and paradigm-shifting qualities. Rate from -50 (strongly A) to 50 (strongly B).
Explain your analysis. Your score will be read by: /SCORE: (-?\\d+)/`
  }
]; 