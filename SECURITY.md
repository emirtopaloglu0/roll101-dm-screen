# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting:
the **Security** tab of this repository, then **Report a vulnerability**.

Include the Foundry VTT version, the module version and steps to reproduce.
You can expect a first answer within a few days.

## Scope notes

The module has no server component and no dependencies. It runs in the Foundry client only for the
Gamemaster. Foundry sends world settings to every connected client, so do not store secrets in boxes.
