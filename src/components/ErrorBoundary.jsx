import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Portal error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot">
        <div className="placeholder error" style={{ maxWidth: 520 }}>
          <b>Something went wrong</b>
          <div>{this.state.error.message}</div>
          <button className="btn btn-dark btn-sm" style={{ marginTop: 10, alignSelf: 'flex-start' }} onClick={() => location.assign('/')}>
            Reload portal
          </button>
        </div>
      </div>
    );
  }
}
