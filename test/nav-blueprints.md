# Navigation Unit Blueprint Fixtures

These blueprints are small manual-test fixtures generated with `dsa-shipshape`.

## nav-destination-66

Purpose: one Starter Navigation Unit with `config_nav_unit.destinationIndex=66`
for testing whether the game accepts Mosaic as a nav-unit destination.

```text
DSA:m8DAzDxhAuMUuQkMDF38yfl5aZnp8XmJZfGleZklDBNanBj6+vomTpw4gYGRsZWVEcgCAA==
```

Decoded shape:

```json
{
  "version": 0,
  "width": 3,
  "height": 3,
  "commands": [
    {
      "type": "configuration",
      "configs": [
        {
          "type": "config_nav_unit",
          "destinationIndex": 66,
          "page": 0,
          "warpActive": false,
          "warpOnCritical": false,
          "warpOnNoCaptains": false
        }
      ]
    },
    {
      "type": "build",
      "x": 1,
      "y": 1,
      "item": 261,
      "bits": "1",
      "shape": 0
    }
  ]
}
```
