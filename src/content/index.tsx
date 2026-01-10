import { render } from 'preact';
import { Panel } from './Panel';

// Create container for the panel
function createPanelContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'bsc-quick-trade-root';
  document.body.appendChild(container);
  return container;
}

// Initialize the panel
function init() {
  // Check if already initialized
  if (document.getElementById('bsc-quick-trade-root')) {
    return;
  }

  const container = createPanelContainer();
  render(<Panel />, container);
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
