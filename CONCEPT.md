# Sensible & Latent — concept and design plan

## Point of view

HVAC is the only building trade whose material is invisible. A mason can point at the wall and a
plumber at the pipe, but a heating-and-cooling technician moves **heat and water vapour through
air**, and proves the work only with instruments: a thermal imager, a manifold, a micron gauge, a
data logger.

Engineers split a cooling load into two halves. **Sensible** heat is what a thermometer sees.
**Latent** heat is the moisture in the air: you feel it, but no thermostat shows it. The fictional
firm is named for both halves: **Sensible & Latent — Heating, Cooling & Air, Tucson, Arizona.**
Their argument is that most bad installs are sized for the half you can see.

**The site runs one pound of refrigerant once around the vapour-compression cycle**, seen through a
technician's thermal imager:

- A pressure–enthalpy chart in the HUD traces the refrigerant's state as you scroll: evaporator →
  compressor → condenser → metering device → back.
- Each take has a temperature, and that temperature sets its colour theme. Cold takes are
  frost-light and hot takes are copper-dark.
- The viewfinder is an infrared camera's readout (take, move, lens, timecode, spot temperature,
  emissivity), not a film slate.

### Checked against the sibling projects

| Already used | Here instead |
|---|---|
| descend the building section (tekton), fall roof→sewer (head-and-fall), one film of nine moves (obra), day-clock light (terre-verte), raking light (sett, plasterer) | one refrigerant cycle on a P-h chart, thermal-imager HUD, temperature-driven themes |
| wall laid course by course, poured monolith, tile rain, blackout film | evaporator coil start-up: a refrigerant front runs the copper hairpins and frost blooms on the fins; camera flies *between the fins* into the film |
| clay-model building constructed (obra) | the building already stands as a glass ghost; the *systems* are installed into it: survey heat-gain → design ghost → ductwork → equipment set → line set brazed → vacuum → charge → air on; noon thermal → dusk |
| car lift, trowel sweep, sight-glass tank, crane slew, corridor dolly | **opposed-blade damper bank**: project photos printed across louvre blades; the actuator flips them in an opposed ripple on a spring-damper linkage while air streams through the gaps |
| pressure-test needle preloader (head-and-fall) | **evacuation**: a digital micron gauge pulls the page down from 760,000 µ to 500 µ on a log scale as real bytes arrive |

## Palette (from the materials)

| Name | Hex | Source | Role |
|---|---|---|---|
| Armaflex | `#0D0F11` | black closed-cell pipe insulation | base, hot takes |
| Galvanised | `#8A949A` | spangled sheet-metal duct | rules, secondary text |
| Frost | `#EAF1F3` | evaporator frost | light text; ground of the cold takes |
| Line-set Copper | `#C46A36` | refrigerant tubing | warm accent, high side |
| Suction Blue | `#63B3E8` | low-side gauge and hose | cold accent, low side, links |
| Ironbow Violet | `#2B0F3D` | the cold end of an IR "ironbow" palette | thermal shadows, deep gradients |

The ironbow ramp (violet → magenta → orange → white-yellow) appears only inside thermal views.

**Generic-default check.** Not cream and terracotta. Not black with an acid accent: the cold half of
the site is light (Frost ground, Armaflex ink), and copper and blue are the low and high sides of a
real manifold rather than decoration. There are no mono all-caps labels. HUD and data use Archivo
SemiCondensed in sentence case with tabular figures, the way a submittal sheet sets them. No rounded
card kits: content sits on hairline rules, on rating plates, on damper blades and on chart paper.

## Type

**Archivo** (variable: `wdth` 62–125, `wght` 100–900) is the only family. Its roles come from the
axes:

- **Display:** Expanded (125) at 800–900, clamp() up to 15vw, tight tracking.
- **Data arrays:** SemiCondensed (87) at 11–12 px, tabular numerals.
- **Body:** Normal (100) at 400.
- **Quotes:** italic.

**Animated axis: `wdth`, as condensation.** Headlines arrive as hot vapour (Expanded, light,
heat-shimmer displaced). As they cool they *condense*, narrowing to a dense, heavy cut. Magnetic
text leans toward the pointer and expands near it, like air warming at the cursor.

## Layout principles

1. **Renard R10 spacing.** Space steps by the preferred-number series engineers use for duct and
   fan sizes (1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8), so the rhythm is irregular but lawful,
   like the log-pressure lines on a P-h chart.
2. **Return → supply.** Copy enters from the left edge (return air), and imagery and data exit on
   the right (supply).
3. **Extreme scale contrast.** One massive display word per take, set flush to the edge and allowed
   to bleed off it, against 11 px data blocks.
4. **Every number carries a unit**, and every unit is one a technician would write: in. w.c., CFM,
   °F DB/WB, µ, psig, SEER2, tons.
5. **Fluid, not stepped.** Type and spacing come from clamp(), and 3D framing is aspect-aware.
   There are no breakpoint snaps for the stages.
