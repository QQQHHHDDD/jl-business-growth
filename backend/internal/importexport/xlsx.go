package importexport

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// XLSX support is deliberately small and template-oriented. The application
// owns the generated workbook format and does not promise compatibility with
// arbitrary spreadsheet features.
func writeXLSX(rows [][]string) ([]byte, error) {
	var output bytes.Buffer
	archive := zip.NewWriter(&output)
	files := map[string]string{
		"[Content_Types].xml":        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
		"_rels/.rels":                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
		"xl/workbook.xml":            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Import" sheetId="1" r:id="rId1"/></sheets></workbook>`,
		"xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
	}
	for name, value := range files {
		file, err := archive.Create(name)
		if err != nil {
			return nil, err
		}
		if _, err := io.WriteString(file, value); err != nil {
			return nil, err
		}
	}
	sheet, err := worksheetXML(rows)
	if err != nil {
		return nil, err
	}
	file, err := archive.Create("xl/worksheets/sheet1.xml")
	if err != nil {
		return nil, err
	}
	if _, err := file.Write(sheet); err != nil {
		return nil, err
	}
	if err := archive.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func worksheetXML(rows [][]string) ([]byte, error) {
	var body strings.Builder
	body.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`)
	for rowIndex, row := range rows {
		body.WriteString(`<row r="`)
		body.WriteString(strconv.Itoa(rowIndex + 1))
		body.WriteString(`">`)
		for columnIndex, value := range row {
			body.WriteString(`<c r="`)
			body.WriteString(cellReference(columnIndex, rowIndex))
			body.WriteString(`" t="inlineStr"><is><t xml:space="preserve">`)
			if err := xml.EscapeText(&body, []byte(value)); err != nil {
				return nil, err
			}
			body.WriteString(`</t></is></c>`)
		}
		body.WriteString(`</row>`)
	}
	body.WriteString(`</sheetData></worksheet>`)
	return []byte(body.String()), nil
}

func cellReference(column, row int) string {
	column++
	var value []byte
	for column > 0 {
		column--
		value = append([]byte{byte('A' + column%26)}, value...)
		column /= 26
	}
	return fmt.Sprintf("%s%d", string(value), row+1)
}

type xlsxSheet struct {
	Rows []xlsxRow `xml:"sheetData>row"`
}

type xlsxRow struct {
	Cells []xlsxCell `xml:"c"`
}

type xlsxCell struct {
	Reference string `xml:"r,attr"`
	Type      string `xml:"t,attr"`
	Value     string `xml:"v"`
	Inline    struct {
		Text string `xml:"t"`
	} `xml:"is"`
}

func readXLSX(data []byte) ([][]string, error) {
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("invalid xlsx archive: %w", err)
	}
	var sheetFile *zip.File
	var sharedFile *zip.File
	for _, file := range archive.File {
		switch file.Name {
		case "xl/worksheets/sheet1.xml":
			sheetFile = file
		case "xl/sharedStrings.xml":
			sharedFile = file
		}
	}
	if sheetFile == nil {
		return nil, fmt.Errorf("xlsx worksheet is missing")
	}
	shared, err := readSharedStrings(sharedFile)
	if err != nil {
		return nil, err
	}
	input, err := sheetFile.Open()
	if err != nil {
		return nil, err
	}
	defer input.Close()
	var sheet xlsxSheet
	if err := xml.NewDecoder(input).Decode(&sheet); err != nil {
		return nil, fmt.Errorf("invalid xlsx worksheet: %w", err)
	}
	rows := make([][]string, 0, len(sheet.Rows))
	for _, row := range sheet.Rows {
		maxColumn := -1
		values := make(map[int]string, len(row.Cells))
		for _, cell := range row.Cells {
			column := referenceColumn(cell.Reference)
			if column < 0 {
				continue
			}
			value := cell.Value
			switch cell.Type {
			case "inlineStr":
				value = cell.Inline.Text
			case "s":
				index, parseErr := strconv.Atoi(value)
				if parseErr != nil || index < 0 || index >= len(shared) {
					return nil, fmt.Errorf("invalid shared string reference")
				}
				value = shared[index]
			}
			values[column] = value
			if column > maxColumn {
				maxColumn = column
			}
		}
		result := make([]string, maxColumn+1)
		for column, value := range values {
			result[column] = value
		}
		rows = append(rows, result)
	}
	return rows, nil
}

func readSharedStrings(file *zip.File) ([]string, error) {
	if file == nil {
		return nil, nil
	}
	input, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer input.Close()
	var shared struct {
		Items []struct {
			Text string `xml:"t"`
		} `xml:"si"`
	}
	if err := xml.NewDecoder(input).Decode(&shared); err != nil {
		return nil, fmt.Errorf("invalid xlsx shared strings: %w", err)
	}
	result := make([]string, 0, len(shared.Items))
	for _, item := range shared.Items {
		result = append(result, item.Text)
	}
	return result, nil
}

func referenceColumn(reference string) int {
	letters := strings.TrimRight(reference, "0123456789")
	if letters == "" {
		return -1
	}
	value := 0
	for _, letter := range strings.ToUpper(letters) {
		if letter < 'A' || letter > 'Z' {
			return -1
		}
		value = value*26 + int(letter-'A'+1)
	}
	return value - 1
}
