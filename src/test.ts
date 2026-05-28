// Karma test entry — Angular testing environment + default Firebase mocks.
import { Provider, Type } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { FIREBASE_TEST_PROVIDERS } from './testing/firebase-test-providers';

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

function providerToken(provider: Provider): Type<unknown> | string | null {
  if (typeof provider !== 'object' || provider === null || !('provide' in provider)) {
    return null;
  }
  return provider.provide as Type<unknown> | string;
}

const configureTestingModule = TestBed.configureTestingModule.bind(TestBed);
TestBed.configureTestingModule = (moduleDef) => {
  const specProviders = moduleDef.providers ?? [];
  const specTokens = new Set(
    specProviders.map(providerToken).filter((token): token is Type<unknown> | string => token != null),
  );
  const defaultFirebase = FIREBASE_TEST_PROVIDERS.filter((provider) => {
    const token = providerToken(provider);
    return token != null && !specTokens.has(token);
  });

  return configureTestingModule({
    ...moduleDef,
    providers: [...defaultFirebase, ...specProviders],
  });
};
