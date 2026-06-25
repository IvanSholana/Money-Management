import React from "react";
import { clearData } from "../utils/storage";

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
  showResetConfirm: boolean;
};

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: "",
    showResetConfirm: false,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
      showResetConfirm: false,
    };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 p-6 text-ink">
        <div className="mx-auto max-w-xl rounded-lg border border-rose-200 bg-white p-5 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">App error</p>
          <h1 className="mt-2 text-2xl font-bold text-navy">Aplikasi gagal dimuat</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Kemungkinan ada data lokal lama atau hasil import yang formatnya tidak cocok. Data kamu masih di browser,
            tapi app tidak bisa render dengan aman.
          </p>
          {this.state.message ? (
            <pre className="mt-3 overflow-auto rounded-md bg-slate-100 p-3 text-xs text-slate-700">
              {this.state.message}
            </pre>
          ) : null}
          {this.state.showResetConfirm ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="font-bold text-rose-800">Reset data lokal aplikasi?</p>
              <p className="mt-1 text-sm leading-6 text-rose-700">
                Ini akan menghapus fallback browser storage. Database SQLite tidak disentuh dari layar error ini.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => {
                    clearData();
                    window.location.reload();
                  }}
                >
                  Ya, reset
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => this.setState({ showResetConfirm: false })}
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <button
              className="danger-button mt-4"
              type="button"
              onClick={() => this.setState({ showResetConfirm: true })}
            >
              Reset Data Lokal
            </button>
          )}
        </div>
      </div>
    );
  }
}
