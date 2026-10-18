# Import test files

Made up for the importer tests: the variables, links and values mean nothing beyond the tests. They follow
the layouts the importers read: a links table (`links.csv`), a Kumu JSON blueprint as Kumu's documentation
describes it (`kumu-blueprint.json`), a Kumu JSON export laid out as Kumu writes its exports
(`kumu-export.json`: its structure follows real exports, its content is invented) and a DataViz project in
DataViz's format version 1 (`garden.dataviz.json`). Spreadsheets are built by the tests themselves
(`../../xlsx.ts`).
