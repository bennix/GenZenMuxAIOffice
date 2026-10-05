# ZenOffice v0.6.98

This maintenance release updates the bundled OfficeCLI to v1.0.154. It fixes Linux editable Office exports that failed during document validation because the v1.0.152 Linux binary omitted required .NET runtime assemblies. The Linux binary was verified on .NET 10 by creating, editing, saving, closing, and validating a PPTX.

The macOS OfficeCLI is still verified against its upstream checksum before packaging and against the ZenOffice Developer ID signature after code signing, so editable exports do not fail with a checksum mismatch in the release app.
