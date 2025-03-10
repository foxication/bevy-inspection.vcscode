import * as vscode from 'vscode';
import { EntityId, ServerVersion } from 'bevy-remote-protocol';
import { ClientCollection } from './client-collection';
import { ConnectionState } from './client';

export function createEntitiesView(entitiesProvider: HierarchyProvider) {
  return vscode.window.createTreeView('entitiesView', {
    treeDataProvider: entitiesProvider,
    canSelectMany: false,
    showCollapseAll: true,
    dragAndDropController: undefined, // TODO
  });
}

export class ClientElement {
  host: string;
  version: ServerVersion;
  state: ConnectionState;

  constructor(host: string, version: ServerVersion, state: ConnectionState) {
    this.host = host;
    this.version = version;
    this.state = state;
  }
}

export class EntityElement {
  host: string;
  state: ConnectionState;
  id: EntityId;
  name?: string;
  childOf?: EntityId;
  children?: EntityId[];

  constructor(
    clientHost: string,
    state: ConnectionState,
    id: EntityId,
    options?: { name?: string; childOf?: EntityId; children?: EntityId[] }
  ) {
    this.host = clientHost;
    this.state = state;
    this.id = id;
    this.name = options?.name;
    this.childOf = options?.childOf;
    this.children = options?.children;
  }
}

export type HierarchyElement = EntityElement | ClientElement;

export class HierarchyProvider implements vscode.TreeDataProvider<HierarchyElement> {
  private clientCollection: ClientCollection;
  private treeIsChangedEmitter = new vscode.EventEmitter<HierarchyElement | undefined | void>();
  readonly onDidChangeTreeData = this.treeIsChangedEmitter.event;

  constructor(clientCollection: ClientCollection) {
    this.clientCollection = clientCollection;
  }

  getChildren(element?: HierarchyElement | undefined): HierarchyElement[] {
    // render all clients and entities
    if (!element) {
      return this.clientCollection.all().map((client) => {
        const protocol = client.getProtocol();
        return new ClientElement(protocol.url.host, protocol.serverVersion, client.getState());
      });
    }

    const client = this.clientCollection.get(element.host);
    if (client === undefined) {
      return [];
    }

    // render entities of client | entity
    if (element instanceof ClientElement || element instanceof EntityElement) {
      return client.getChildren(element);
    }

    return [];
  }

  getTreeItem(element: HierarchyElement): vscode.TreeItem {
    if (element instanceof ClientElement) {
      const client = this.clientCollection.get(element.host);
      if (client === undefined) {
        return new vscode.TreeItem('No such client');
      }

      const hasEntities = client.getEntitiesElements().size > 0;
      const collapsible = hasEntities ? vscode.TreeItemCollapsibleState.Expanded : undefined;
      const treeItem = new vscode.TreeItem(element.host.toString(), collapsible);

      // Context + description
      if (client.getState() === 'alive') {
        treeItem.contextValue = 'clientElementAlive';
        treeItem.description = 'Version: ' + element.version;
      } else {
        treeItem.contextValue = 'clientElementDead';
        treeItem.description = 'Disconnected';
      }
      return treeItem;
    }

    // if element instanceof EntityElement
    const collapsible =
      element.children === undefined || element.children.length === 0
        ? undefined
        : vscode.TreeItemCollapsibleState.Expanded;
    const treeItem = new vscode.TreeItem(element.name ?? element.id.toString(), collapsible);
    treeItem.id = element.host + '/' + element.id.toString();
    if (collapsible === undefined) {
      switch (element.state) {
        case 'dead':
          treeItem.iconPath = new vscode.ThemeIcon('circle-filled');
          break;
        case 'alive':
          treeItem.iconPath = new vscode.ThemeIcon('circle-outline');
          break;
      }
    }
    if (element.name) {
      treeItem.description = element.id.toString();
    }
    treeItem.tooltip = treeItem.id;
    switch (element.state) {
      case 'dead':
        treeItem.contextValue = 'entityElementDead';
        break;
      case 'alive':
        treeItem.contextValue = 'entityElementAlive';
        break;
    }
    return treeItem;
  }

  updateClients() {
    this.treeIsChangedEmitter.fire();
  }

  updateInClient(host: string) {
    this.treeIsChangedEmitter.fire(this.clientCollection.getElement(host));
  }

  updateInScope(parent: EntityElement) {
    this.treeIsChangedEmitter.fire(parent);
  }
}
