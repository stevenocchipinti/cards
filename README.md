# Phone Compass

A single static page (`site/index.html`, no build step and no dependencies) that reads your phone's orientation sensors and shows which direction it's pointing.

## Deploying

1. Push this repo to GitHub on the `main` branch.
2. In the repo, open **Settings › Pages** and set **Source** to **GitHub Actions** (the workflow also tries to turn this on for you).
3. The **Deploy to GitHub Pages** action publishes `site/` to `https://<user>.github.io/<repo>/`.

Sensors only work over HTTPS, which GitHub Pages provides.

## How it picks a heading

It listens to every source it can and uses the best one that's currently sending data:

| Priority | Source | Where it works |
|---|---|---|
| 1 | `AbsoluteOrientationSensor` (Generic Sensor API) | Chrome / Edge / Samsung Internet on Android |
| 2 | `webkitCompassHeading` | Safari and all iOS browsers (asks for permission on tap) |
| 3 | `deviceorientationabsolute` | Chromium on Android |
| 4 | `deviceorientation` with `absolute: true` | Firefox for Android, some others |
| 5 | GPS course (`coords.heading`) | Any device with GPS, but only while you're moving (opt-in button) |
| 6 | Relative `deviceorientation` | Last resort, not tied to north |

"Pointing" means the top edge of the screen when the phone lies flat, and the back camera's direction when you hold it upright. Tilting between the two doesn't make the heading jump. The page also corrects for landscape rotation.

Headings are relative to **magnetic** north, except for GPS, which uses true north. Open **Sensor diagnostics** on the page to see raw values from each sensor.

## Testing locally

```sh
python3 -m http.server -d site 8000
```

Desktop browsers usually have no compass. Use Chrome DevTools › More tools › **Sensors** to fake orientation data. Phones need HTTPS, so use the Pages URL to test on a phone.
