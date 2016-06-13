"use strict";
var iaasService = shekelApp.factory('iaasService', function(sizingStorageService, $http) {
  var ramOverhead = 3;
  var diskOverhead = 20;
  var aisPerPack = 50;
  var instanceTypes = [];
  var iaasService = {
    vms: [],
    templateVms: [],
    resourceSummary: {
      azCount: 0,
      ram: 0,
      disk: 0,
      cpu: 0,
      ips: 0,
      vmTypes: [],
      cost: 0
    },
    diegoCellSummary: {
      availableCellRam: 0,
      availableCellDisk: 0,
      useableCellRam: 0,
      useableCellDisk: 0,
      numberOfCells: 0,
      cellsPerAZ: 0,
      totalRam: 0
    },
  };

  iaasService.getRamOverhead = function() {
    return ramOverhead;
  }

  iaasService.getDiskOverhead = function() {
    return diskOverhead;
  }

  iaasService.getAIsPerPack = function() {
    return aisPerPack;
  }
  /**
    methods for VMs currently active
  */
  iaasService.addTileVMs = function(tile, size) {
    var t = this;
    this.removeVMs(tile);
    this.getTemplateVMs(tile, size).forEach(function(vm) {
      t.addVM(vm);
    });
  };

  iaasService.addVM = function(vm) {
    this.vms.push(vm);
  };

  iaasService.resetVMs = function() {
    this.vms = [];
  };

  iaasService.removeVMs = function(tile) {
    return _.remove(this.vms, {tile: tile});
  };

  iaasService.getVMs = function(tile) {
    if (tile === undefined) {
      return this.vms;
    }
    return _.filter(this.vms, {tile: tile});
  };

  /**
    END methods for VMs currently  active
  */

  /**
    methods for VMs loaded from templates
  */
  iaasService.addTemplateVM = function(vm) {
    this.templateVms.push(vm);
  };

  iaasService.resetTemplateVMs = function() {
    this.templateVms = [];
  };

  iaasService.removeTemplateVMs = function(tile) {
    return _.remove(this.templateVms, {tile: tile});
  };

  iaasService.getTemplateVMs = function(tile, size) {
    if (tile === undefined && size === undefined) {
      console.log('Tile and size required');
      return;
    }
    return _.filter(this.templateVms, {tile: tile, tshirt: size});
  };

  /**
    END methods for VMs loaded from templates
  */

  iaasService.getInstanceTypes = function() {
    return this.instanceTypes;
  }

  iaasService.getInstanceTypeInfo = function(instanceType) {
    return _.find(this.instanceTypes, {name: instanceType});
  }

  iaasService.getDiegoCellInfo = function() {
    return _.find(this.vms, {tile: "Elastic Runtime", vm: "Diego Cell"});
  };

  iaasService.getDiegoCellTemplateInfo = function() {
    return _.find(this.templateVms, {tile: "Elastic Runtime", vm: "Diego Cell"});
  };

  iaasService.generateResourceSummary = function() {
    this.resourceSummary.azCount = sizingStorageService.data.elasticRuntimeConfig.azCount;
    this.resourceSummary.ram = 0;
    this.resourceSummary.disk = 0;
    this.resourceSummary.cpu = 0;
    this.resourceSummary.ips = 0;
    this.resourceSummary.cores = 0;
    this.resourceSummary.vmTypes = [];
    this.resourceSummary.cost = 0;

    for (var i=0; i < this.vms.length; i++) {
      var vm = this.vms[i];
      if (vm.instance_type) {
        var cost = vm.instances * vm.instanceInfo.cost;
        this.resourceSummary.ram += vm.instanceInfo.ram * vm.instances; //total ram
        this.resourceSummary.disk += (vm.persistent_disk + vm.instanceInfo.ephemeral_disk) * vm.instances; //total disk both ephemeral and persistent
        this.resourceSummary.cpu += vm.instanceInfo.cpu * vm.instances; //total cpu
        this.resourceSummary.ips += (vm.dynamic_ips + vm.static_ips) * vm.instances; //total IPs static and dynamic
        this.resourceSummary.cost += cost;

        var type = _.find(this.resourceSummary.vmTypes, {name: vm.instance_type});
        if (type !== undefined) {
          type.count += vm.instances;
          type.cost += cost;
        } else {
          this.resourceSummary.vmTypes.push({name: vm.instance_type, count: vm.instances, cost: cost, cpu: vm.instanceInfo.cpu, ram: vm.instanceInfo.ram});
        }
      }
    }
    this.resourceSummary.ram = Math.ceil(this.resourceSummary.ram); //round up to a whole GB
    this.resourceSummary.disk = Math.ceil(this.resourceSummary.disk); //round up to a whole GB
  };

  iaasService.generateDiegoCellSummary = function() {
    var cell = this.getDiegoCellInfo();
    if (cell !== undefined) {
      this.diegoCellSummary.totalRam = cell.instances * cell.instanceInfo.ram;
      this.diegoCellSummary.useableCellRam = cell.instanceInfo.ram - ramOverhead
      this.diegoCellSummary.useableCellDisk = cell.instanceInfo.ephemeral_disk - diskOverhead;
      this.diegoCellSummary.availableCellRam = cell.instances * this.diegoCellSummary.useableCellRam;
      this.diegoCellSummary.availableCellRam -= (sizingStorageService.data.elasticRuntimeConfig.avgAIRAM * sizingStorageService.data.aiPacks * aisPerPack);
      this.diegoCellSummary.availableCellDisk = cell.instances * this.diegoCellSummary.useableCellDisk;
      this.diegoCellSummary.availableCellDisk -= (sizingStorageService.data.elasticRuntimeConfig.avgAIDisk * sizingStorageService.data.aiPacks * aisPerPack);
      this.diegoCellSummary.numberOfCells = cell.instances;
      this.diegoCellSummary.cellsPerAZ = Math.ceil(this.diegoCellSummary.numberOfCells / sizingStorageService.data.elasticRuntimeConfig.azCount)
    }
  };

  iaasService.getDiegoCellSummary = function() {
    return this.diegoCellSummary;
  }

  iaasService.getResourceSummary = function() {
    return this.resourceSummary;
  }

  iaasService.loadIaaSTemplate = function(iaas) {
    var url = ['/instanceTypes', iaas].join('/');
    return $http.get(url)
    .success(function(data) {
      iaasService.instanceTypes = data;
    }).error(function(data) {
      alert("Failed to get PCF Iaas Types");
    });
  };

  iaasService.processTemplates = function(sizes) {
    Object.keys(sizes).forEach(function(size) {
      var vms = sizes[size];
      vms.forEach(function(vm) {
        vm.instanceInfo = iaasService.getInstanceTypeInfo(vm.instance_type);
        vm.tshirt = size;
        iaasService.addTemplateVM(vm);
      });
    });
  };

  iaasService.loadERSTemplates = function(iaas, ersVersion) {
    var t = this;
    var url = ['/ersjson', iaas, ersVersion].join('/');

    return $http.get(url)
    .success(function(data) {
      t.removeVMs('Elastic Runtime');
      t.removeTemplateVMs('Elastic Runtime');
      t.processTemplates(data);
    }).error(function(data) {
      alert("Failed to get PCF Template JSON template");
    });
  };

  iaasService.loadTileTemplate = function(tileName, tileVersion) {
    var t = this;
    var url = ['/tile', $scope.serviceData.selectedIaaS.name, tileName, tileVersion].join('/');

    return $http.get(url)
    .success(function(data) {
      t.removeVMs(tileName);
      t.removeTemplateVMs(tileName);
      t.processTemplates(data);
    }).error(function(data) {
      alert("Failed to get " + tileName + " " + tileVersion + " Service Template JSON template");
    });
  };

  return iaasService;
});
