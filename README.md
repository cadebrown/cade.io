# cade.io: Near Computronium

This is the source code for my personal website ([cade.io](https://cade.io)), which is built using [Astro](https://astro.build) and hosted using [GitHub Pages](https://pages.github.com/). This includes my personal blog posts, prototype projects, and artwork I've made over the years.

It's quite modularized, so feel free to use it as a template or starting point for your own website.

## Links

* [cade.io](https://cade.io) - my personal website (live demo)
* [GitHub Repository](https://github.com/cadebrown/cade.io) - the source code
* [Can I Use?](https://caniuse.com/) - check browser compatibility for various web features
* [Astro Documentation](https://docs.astro.build) - learn more about the Astro framework

## Setup

First, clone this repository [from GitHub](https://github.com/cadebrown/cade.io), and ensure you have [installed Node.js/NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) on your machine.

Then, you can install the project's dependencies locally:

```sh
npm install
```

To make sure everything is working, you can start the development server:

```sh
npm run dev
```

Now, you should be able to access it via a web browser at [localhost:4321](http://localhost:4321). It will automatically reload and update as you make changes to the source code. Enjoy!

## Usage

All commands are run from the root of the project, from a shell:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

Further documentation can be found at the [Astro CLI Reference](https://docs.astro.build/en/reference/cli-reference/).

## Structure

This project mainly follows the official [Astro project structure guide](https://docs.astro.build/en/basics/project-structure/), which means many of the paths listed are special:

```text
├── plugins/               # my custom plugins
├── public/                # static assets, copied verbatim
├── src/                   # source code for the site
│   ├── components/        # reusable components
│   ├── layouts/           # reusable layouts
│   ├── content/           # markdown content like blog posts
│   └── pages/             # static pages of content
├── astro.config.ts        # Astro configuration
└── tsconfig.json          # TypeScript configuration
```

To add a new blog post, add a new file in the `./src/content/posts` directory (just copy from an existing one).


## Utilities

### Visual Studio Code: Editor and IDE

My personal development setup includes using [Visual Studio Code](https://code.visualstudio.com/), with the following extensions:

* Astro Language Support Extension [astro-build.astro-vscode](https://marketplace.visualstudio.com/items?itemName=astro-build.astro-vscode)

You can read more about setting up your own environment in the [Astro Editor Setup Guide](https://docs.astro.build/en/editor-setup/).

This uses [Prettier](https://prettier.io/) as the formatting engine. I had to define my configuration options in `.prettierrc.json` for the Astro extension to format properly. You can customize the syntax choices in the [Prettier Configuration Options](https://prettier.io/docs/en/configuration.html).

### KaTeX: Math Rendering

[KaTeX](https://katex.org/docs/browser) is a way of writing mathematical equations in LaTeX format (as well as other typesetting and diagrams).

I used [KaTeX v0.16.21](https://github.com/KaTeX/KaTeX/releases/tag/v0.16.21) and stuck it in `./public/ext/katex/`, since we still have to ship the CSS and some extension JS files apart from the static renderer.

* [KaTeX extension: copy-tex](https://github.com/KaTeX/KaTeX/tree/main/contrib/copy-tex) - allows copying the LaTeX source of an equation

```sh
npm i katex
```

And to integrate it in Astro (via `astro.config.ts`), it needs remark/rehype plugins:

```sh
npm install remark-math
npm install rehype-katex
```

### Expressive Code: Syntax Highlighting

[Expressive Code](https://expressive-code.com/installation/) is hands-down the best syntax highlighting system I've found. It's easy to drop in, but I've customized it quite a lot.

I use the following plugins (or am experimenting with using them):

* [@fujocoded/expressive-code-caption](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/expressive-code-caption)
* [@fujocoded/expressive-code-output](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/expressive-code-output)

```sh
npx astro add astro-expressive-code
npm i @expressive-code/plugin-collapsible-sections
npm i @expressive-code/plugin-line-numbers

# community
npm i expressive-code-color-chips
```

### Astro Icon: Icons and SVGs

I use the [Astro Icon](https://www.astroicon.dev/getting-started/) package to manage SVG icons and components. I override the `iconDir` as `./public/icons/` in the `astro.config.ts` file. This way, I will also ship static SVGs for the icons, in case I can't use the component.

```sh
npm install astro-icon
```

As far as finding icons, I use a variety of sources:

* [feathericons.com](https://feathericons.com/) - super high quality, beautiful, but limited selection (preferred)
* [remixicon.com](https://remixicon.com/)

Also, with more customization and sometimes lower quality:

* [iconduck.com](https://iconduck.com/)
* [jam-icons.com](https://jam-icons.com/)
* [heroicons.dev](https://heroicons.dev/?iconset=v2-20-solid)

## Processes

### Hosting on GitHub Pages

To deploy to GitHub Pages, we can follow the [Official Astro Guide](https://docs.astro.build/en/guides/deploy/github/). Specifically, I used `cade.io` and set up [a custom domain for GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

### Updating the Favicon

I use [Inkscape](https://inkscape.org/) to maintain my site's favicon in the `./public/favicon.dev.svg` file. That includes all the editing layers, text objects, and shapes sources.

After I change it and save the file, the steps to update the site's favicon are:

* Use the [RealFaviconGenerator](https://realfavicongenerator.net/) website and upload `./public/favicon.dev.svg` to it
* Follow the steps in the workflow configuration
  * I use the same icon for light/dark mode
  * I select 'Use the icon as is` for all inputs
  * I use `cade.io` as the app name for all boxes
* Download the archive file, and unzip directly into `./public`, overwriting the existing files
  * For example: `unzip -o ~/Downloads/favicon.zip -d ./public`
* Insert the generated HTML code into the `./src/components/BaseHead.astro` file

### Managing Themes


* [Get Rid of Theme Flicker](https://scottwillsey.com/theme-flicker/)

### Converting Fonts

For this website, I have been using the following fonts:

* [Ubuntu](https://fonts.google.com/specimen/Ubuntu) - for normal prose text, headers, and UI elements
* [Ubuntu Mono](https://fonts.google.com/specimen/Ubuntu+Mono) - for code blocks and monospaced text

You can download these fonts from Google Fonts, but they will be in TTF format. Instead, we'd like to use WOFF2 format which is more optimized for web loading. To do that, we need to install or build [Google's implementation](https://github.com/google/woff2).

* MacOS: `brew install woff2`

Then, after downloading and extracting the font files, you can use the `./scripts/woff2ify` script to convert them:

```sh
./scripts/woff2ify.sh ./public/fonts ~/Downloads/Ubuntu/*.ttf ~/Downloads/Ubuntu_Mono/*.ttf
```

## Scratch Space

* https://pyodide.org/en/stable/ - for JS embedding of Python code
