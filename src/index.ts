import sentry from '@sentry/node';
import defaults from 'lodash/defaults';
import defaultsDeep from 'lodash/defaultsDeep';
import get from 'lodash/get';
import has from 'lodash/has';
import isEmpty from 'lodash/isEmpty';
import omit from 'lodash/omit';
import TransportStream = require('winston-transport');
import { isError } from './is-error';
import { Context } from './types';

const errorHandler = (err: any) => {
  // tslint:disable-next-line
  console.error(err);
};

export default class Sentry extends TransportStream {
  protected name: string;
  protected tags: { [s: string]: any };
  protected sentryClient: typeof sentry;
  protected levelsMap: any;

  constructor(opts: any) {
    super(opts);

    this.name = 'winston-sentry-log';
    this.tags = {};
    const options = opts;

    defaultsDeep(opts, {
      errorHandler,
      config: {
        dsn: process.env.SENTRY_DSN || '',
        logger: 'winston-sentry-log',
        captureUnhandledRejections: false,
      },
      name: 'winston-sentry-log',
      silent: false,
      level: 'info',
      levelsMap: {
        silly: 'debug',
        verbose: 'debug',
        info: 'info',
        debug: 'debug',
        warn: 'warning',
        error: 'error',
      },
    });

    this.levelsMap = options.levelsMap;

    if (options.tags) {
      this.tags = options.tags;
    } else if (options.globalTags) {
      this.tags = options.globalTags;
    } else if (options.config.tags) {
      this.tags = options.config.tags;
    }

    if (options.extra) {
      options.config.extra = options.config.extra || {};
      options.config.extra = defaults(options.config.extra, options.extra);
    }

    this.sentryClient = options.sentryClient || require('@sentry/node');

    if (!!this.sentryClient) {
      this.sentryClient.init(options.config || {
        dsn: process.env.SENTRY_DSN || '',
      });

      this.sentryClient.configureScope((scope: any) => {
        if (!isEmpty(this.tags)) {
          scope.setTags(this.tags);
        }
      });
    }
  }

  public log(info: any, callback: any) {
    const { message, fingerprint } = info;
    const level = Object.keys(this.levelsMap).find(key => info.level.toString().includes(key));

    if (!level) {
      return callback(null, true);
    }

    const meta = { ...omit(info, ['level', 'message', 'label']) };

    setImmediate(() => {
      this.emit('logged', level);
    });

    if (!!this.silent) {
      return callback(null, true);
    }

    const context: Context = {};
    context.level = this.levelsMap[level];
    context.extra = omit(meta, ['user', 'stack']);

    if (fingerprint) {
      context.fingerprint = [fingerprint, process.env.NODE_ENV];
    }

    this.sentryClient.withScope((scope: sentry.Scope) => {
      const user = get(meta, 'user');

      if (has(context, 'extra')) {
        scope.setExtras(context.extra);
      }

      if (!isEmpty(this.tags)) {
        scope.setTags(this.tags);
      }

      if (!!user) {
        scope.setUser(user);
      }

      if (context.level === 'error' || context.level === 'fatal') {
        let exception = info;
        if (!isError(exception)) {
          exception = new Error(message);
        }

        this.sentryClient.captureException(exception);
      } else {
        this.sentryClient.captureMessage(message);
      }

      return callback(null, true);
    });
  }
}

module.exports = Sentry;
