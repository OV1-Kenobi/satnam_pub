/**
 * Test suite for sanitizeCSVCell function
 * Verifies CSV injection prevention and proper escaping
 */

// Note: This is a reference test file. The actual sanitizeCSVCell function
// is defined in src/components/identity/SimpleProofAnalyticsDashboard.tsx

const sanitizeCSVCell = (value: string | number | undefined): string => {
  if (value === undefined || value === null) return '';
  const str = String(value);

  // Prevent CSV injection: prefix dangerous characters with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }

  // Escape internal quotes by doubling them, and wrap in quotes if needed
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

describe('sanitizeCSVCell', () => {
  describe('Formula Injection Prevention', () => {
    test('should prefix = with single quote', () => {
      expect(sanitizeCSVCell('=1+1')).toBe('"\'=1+1"');
    });

    test('should prefix + with single quote', () => {
      expect(sanitizeCSVCell('+1+1')).toBe('"\'+ 1+1"');
    });

    test('should prefix - with single quote', () => {
      expect(sanitizeCSVCell('-1+1')).toBe('"\'- 1+1"');
    });

    test('should prefix @ with single quote', () => {
      expect(sanitizeCSVCell('@SUM(A1:A10)')).toBe('"\'@SUM(A1:A10)"');
    });

    test('should prefix tab character with single quote', () => {
      expect(sanitizeCSVCell('\t1+1')).toBe('"\'\\t1+1"');
    });

    test('should prefix carriage return with single quote', () => {
      expect(sanitizeCSVCell('\r1+1')).toBe('"\'\\r1+1"');
    });
  });

  describe('Quote Escaping', () => {
    test('should double internal quotes', () => {
      expect(sanitizeCSVCell('cell with "quotes"')).toBe('"cell with ""quotes"""');
    });

    test('should handle multiple quotes', () => {
      expect(sanitizeCSVCell('a"b"c"d')).toBe('"a""b""c""d"');
    });

    test('should escape quotes in formula injection', () => {
      expect(sanitizeCSVCell('="malicious"')).toBe('"\'=""malicious"""');
    });
  });

  describe('Comma and Newline Handling', () => {
    test('should wrap cells with commas', () => {
      expect(sanitizeCSVCell('value, with, commas')).toBe('"value, with, commas"');
    });

    test('should wrap cells with newlines', () => {
      expect(sanitizeCSVCell('line1\nline2')).toBe('"line1\nline2"');
    });

    test('should handle both commas and quotes', () => {
      expect(sanitizeCSVCell('value, with "quotes", and commas')).toBe('"value, with ""quotes"", and commas"');
    });
  });

  describe('Edge Cases', () => {
    test('should handle undefined', () => {
      expect(sanitizeCSVCell(undefined)).toBe('');
    });

    test('should handle null', () => {
      expect(sanitizeCSVCell(null as any)).toBe('');
    });

    test('should handle empty string', () => {
      expect(sanitizeCSVCell('')).toBe('');
    });

    test('should handle numbers', () => {
      expect(sanitizeCSVCell(123)).toBe('123');
    });

    test('should handle normal text without special characters', () => {
      expect(sanitizeCSVCell('normal text')).toBe('normal text');
    });

    test('should handle text with spaces', () => {
      expect(sanitizeCSVCell('text with spaces')).toBe('text with spaces');
    });
  });

  describe('Real-World Examples', () => {
    test('should handle Bitcoin transaction hash', () => {
      const txHash = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      expect(sanitizeCSVCell(txHash)).toBe(txHash);
    });

    test('should handle ISO timestamp', () => {
      const timestamp = '2025-11-08T12:34:56.789Z';
      expect(sanitizeCSVCell(timestamp)).toBe(timestamp);
    });

    test('should handle percentage values', () => {
      expect(sanitizeCSVCell('95.50')).toBe('95.50');
    });

    test('should handle UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(sanitizeCSVCell(uuid)).toBe(uuid);
    });

    test('should handle malicious Excel formula', () => {
      const malicious = '=cmd|"/c calc"!A0';
      expect(sanitizeCSVCell(malicious)).toBe('"\'=cmd|"/c calc"!A0"');
    });
  });
});

