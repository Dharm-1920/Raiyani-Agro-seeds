import { tr } from "./language.jsx";
import { Component } from 'react';
export default class ErrorBoundary extends Component {
  state = {
    failed: false
  };
  static getDerivedStateFromError() {
    return {
      failed: true
    };
  }
  componentDidCatch(error, info) {
    console.error('Page rendering failed:', error, info);
  }
  render() {
    if (this.state.failed) return <section className="box narrow" role="alert"><h1>{tr("Page could not load")}</h1><p>{tr("Reload to try again. If this continues, check the first red error in your browser console.")}</p><button onClick={() => window.location.reload()}>{tr("Reload website")}</button></section>;
    return this.props.children;
  }
}
