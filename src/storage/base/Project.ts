import Entity, { IStaticEntity } from './Entity';
import Plugin, { PluginOpts } from '../../plugins/Plugin';
import Resource, { ResourceQuery } from './Resource';
import PluginStore from '../../pluginstore/PluginStore';
import { LogWrapper } from '../../logger/Logger';
import { normalizeUrl } from '../../plugins/url-utils';

/** Groups resources sharing the same scrape configuration and discovered from the same initial URLs. */
export default abstract class Project extends Entity {
  logger: LogWrapper;

  id: number;
  name: string;
  url: string;

  // stored as json string, initialized as PluginOpts[]
  pluginOpts: PluginOpts[];

  // initialized based on pluginOpts
  plugins: Plugin[];

  // populated based on countResources, usefull info to have when serializing to plugin exection in DOM
  resourceCount:number;

  constructor(kwArgs: Partial<Project> = {}) {
    super(kwArgs);

    if (typeof kwArgs.pluginOpts === 'string') {
      this.pluginOpts = JSON.parse(kwArgs.pluginOpts);
    }

    /*
    normalizeUrl fails silently on invalid urls, this is the desired behavior for batch inserting new resource urls
    in this case though we want project initialization to fail
    */
    const normalizedUrl = normalizeUrl(this.url);
    if (!normalizedUrl) throw new Error(`invalid url ${this.url}`);

    this.url = normalizedUrl;
  }

  initPlugins(browserClientPresent:boolean):Plugin[] {
    const plugins = this.pluginOpts.map((pluginOpt:PluginOpts) => {
      const PluginCls = PluginStore.get(pluginOpt.name).Cls;
      return new PluginCls(pluginOpt);
    });

    const domPlugins = plugins.filter(plugin => plugin.opts && (plugin.opts.domRead || plugin.opts.domWrite));
    if (domPlugins.length > 0 && !browserClientPresent) {
      throw new Error(`Attempting to run plugins in browser DOM (${domPlugins.map(plugin => plugin.constructor.name).join(', ')}) without a browser`);
    }

    return plugins;
  }

  abstract countResources():Promise<number>;

  abstract getResourceToScrape():Promise<Resource>;

  abstract getResource(url: string):Promise<Resource>;

  abstract getResources():Promise<Resource[]>;

  abstract getPagedResources(query: Partial<ResourceQuery>):Promise<Partial<Resource>[]>;

  abstract saveResources(resources: Partial<Resource>[]):Promise<void>;

  abstract batchInsertResources(resources: {url: string, depth?: number}[], chunkSize?:number):Promise<void>;

  abstract batchInsertResourcesFromFile(resourcePath: string, chunkSize?:number):Promise<void>;

  abstract createResource(resource: Partial<Resource>):Resource;

  get dbCols() {
    return [ 'id', 'name', 'url', 'pluginOpts' ];
  }

  async toExecJSON() {
    const jsonObj = this.toJSON();
    const resourceCount = await this.countResources();
    return { ...jsonObj, resourceCount };
  }
}

export interface IStaticProject extends IStaticEntity {
  new(kwArgs: Partial<Project>): Project;
  get(nameOrId: string | number):Promise<Project>;
  getAll():Promise<any[]>;
  getProjectToScrape():Promise<Project>
}
