# Icon sets

Each subfolder is a selectable icon set (Settings → Appearance → ICONS).
`classic` is built-in emoji and needs no files here.

Drop one image per tab, **named by tab id**, into the set's folder. SVG or PNG
(mix is fine — `.svg` is tried first, then `.png`). Missing files fall back to
the emoji automatically, so partial sets work.

```
public/icons/<set>/
  calculator.{svg,png}   interpolation.{svg,png}   edto.{svg,png}
  currency.{svg,png}     metartaf.{svg,png}        notam.{svg,png}
  ftl.{svg,png}          dutylog.{svg,png}         worldtime.{svg,png}
  prayer.{svg,png}
```

In-tab sub-nav tabs also resolve icons by id the same way (Calculator's
mode toggle, Qiblat & Solat's sub-nav):

```
public/icons/<set>/
  basic.{svg,png}        scientific.{svg,png}      time.{svg,png}
  convert.{svg,png}      times.{svg,png}           qiblat.{svg,png}
  flight.{svg,png}
```

Grouped/launcher headers reuse a member's icon (calculator, edto, metartaf,
ftl, prayer), so no extra group files are needed.

Set ids/labels are defined in `src/components/TabIcon.jsx` (`ICON_SETS`) —
currently `set-a` / `set-b`, labelled SET A / SET B. Rename there.
```
