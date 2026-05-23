import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { en_US, provideNzI18n } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import en from '@angular/common/locales/en';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import {
  DashboardOutline,
  FileTextOutline,
  ShopOutline,
  DatabaseOutline,
  MessageOutline,
  LogoutOutline,
  ToolOutline,
  ShoppingCartOutline,
  UserOutline,
  DownOutline,
  EnvironmentOutline,
  InboxOutline,
  SearchOutline,
  EyeOutline,
  RightOutline,
  CheckCircleOutline,
  PlusOutline,
  CheckOutline,
  MenuOutline,
  CloseOutline,
  SendOutline,
  ArrowLeftOutline,
} from '@ant-design/icons-angular/icons';

registerLocaleData(en);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimationsAsync(),
    provideHttpClient(),
    provideNzI18n(en_US),
    provideNzIcons([
      DashboardOutline,
      FileTextOutline,
      ShopOutline,
      DatabaseOutline,
      MessageOutline,
      LogoutOutline,
      ToolOutline,
      ShoppingCartOutline,
      UserOutline,
      DownOutline,
      EnvironmentOutline,
      InboxOutline,
      SearchOutline,
      EyeOutline,
      RightOutline,
      CheckCircleOutline,
      PlusOutline,
      CheckOutline,
      MenuOutline,
      CloseOutline,
      SendOutline,
      ArrowLeftOutline,
    ]),
  ],
};
