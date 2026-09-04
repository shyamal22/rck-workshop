import { render } from 'preact';
import { App } from './App';
import { startSession } from '../data/session';
import '../ui/app.css';

startSession();
render(<App />, document.getElementById('app')!);
