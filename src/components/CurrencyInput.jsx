import React, { useState, useEffect } from "react";

function formatEuro(rawNumber) {
  if (!rawNumber) return "";
  return new Intl.NumberFormat("it-IT").format(rawNumber);
}

function parseDigitsOnly(value) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

export function CurrencyInput({ value, onChange, label, placeholder = "es. 100.000" }) {
  const [display, setDisplay] = useState(formatEuro(value));

  useEffect(() => {
    setDisplay(formatEuro(value));
  }, [value]);

  function handleChange(e) {
    const numeric = parseDigitsOnly(e.target.value);
    setDisplay(formatEuro(numeric));
    onChange(numeric);
  }

  return (
    <div>
      {label && (
        <label
          style={{
            display: "block",
            fontSize: 14,
            fontWeight: 500,
            color: "#1D1D1F",
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#FFFFFF",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14,
          padding: "12px 16px",
        }}
      >
        <span style={{ color: "#6E6E73", fontWeight: 500 }}>€</span>
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          placeholder={placeholder}
          style={{
            border: "none",
            outline: "none",
            fontSize: 16,
            width: "100%",
            fontFamily: "inherit",
            color: "#1D1D1F",
          }}
        />
      </div>
    </div>
  );
}
