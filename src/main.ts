import { Capacitor } from '@capacitor/core';
import './styles.css';
import { App } from './app';
import { NativeSource } from './sources/native';
import { WebSource } from './sources/web';

const source = Capacitor.isNativePlatform() ? new NativeSource() : new WebSource();
const app = new App(source);
app.start();
