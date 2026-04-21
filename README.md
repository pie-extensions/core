# pie-extensions

Making PHP extensions installable via [PIE](https://github.com/php/pie) today.

> **Disclaimer:** This project is not affiliated with or endorsed by the PHP project or the official PIE team. It is an independent effort to make extensions available through PIE before they add native support. For official PIE, see [php/pie](https://github.com/php/pie).

## Quick install

```bash
pie install pie-extensions/protobuf
```

## Currently mirrored extensions

<!-- extensions-table-start -->
| Extension | Upstream | Mirror | Packagist |
|-----------|----------|--------|-----------|
| igbinary | [igbinary/igbinary](https://github.com/igbinary/igbinary) | [pie-extensions/igbinary](https://github.com/pie-extensions/igbinary) | [pie-extensions/igbinary](https://packagist.org/packages/pie-extensions/igbinary) |
| redis | [phpredis/phpredis](https://github.com/phpredis/phpredis) | [pie-extensions/redis](https://github.com/pie-extensions/redis) | [pie-extensions/redis](https://packagist.org/packages/pie-extensions/redis) |
| protobuf | [protocolbuffers/protobuf](https://github.com/protocolbuffers/protobuf) | [pie-extensions/protobuf](https://github.com/pie-extensions/protobuf) | [pie-extensions/protobuf](https://packagist.org/packages/pie-extensions/protobuf) |
<!-- extensions-table-end -->

See [`registry.json`](registry.json) for the full list. See [`.pie-mirror.example.json`](.pie-mirror.example.json) for all available mirror configuration options.

## How it works

1. A **daily cron** checks each upstream repo for new releases
2. When a new release is found, it **dispatches a sync** to the corresponding mirror repo
3. The mirror repo runs [mirror-action](https://github.com/pie-extensions/mirror-action), which syncs the release, creates a tagged release with PIE-compatible `composer.json`, and builds binaries
4. A **weekly health check** detects stale or broken mirrors and opens issues

## Request a new extension

Want an extension added? [Open an extension request](https://github.com/pie-extensions/core/issues/new?template=extension-request.yml).

## Questions & discussion

For questions, ideas, or anything that isn't an extension request, head to [GitHub Discussions](https://github.com/pie-extensions/core/discussions).

## Related repositories

- [pie-extensions/mirror-action](https://github.com/pie-extensions/mirror-action) — composite action that handles sync, release, and binary builds
- [pie-extensions/builder](https://github.com/pie-extensions/builder) — builds PHP extension binaries for multiple platforms
- [pie-extensions/extension-template](https://github.com/pie-extensions/extension-template) — template repo used when creating new mirrors

## License

[MIT](LICENSE)
