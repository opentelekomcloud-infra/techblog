---
layout: post
title:  "Get OpenShift Origin 3.7 on Fedora 27 Atomic running on Open Telekom Cloud"
date:   2018-03-23 12:10:29 +0100
author: A. Goncharov
categories: otc blueprint
---
This document describes procedure how to get OpenShift Origin 3.7 installed on Fedora 27 Atomic instances on top of the infrastructure provided by Open Telekom Cloud (OTC).

 * version: 1

Mostly this document will rely on the ReferenceArchitecture provided by the RedHat [Reference Architecture](https://access.redhat.com/documentation/en-us/reference_architectures/2017/html/deploying_and_managing_red_hat_openshift_container_platform_3.6_on_red_hat_openstack_platform_10/). Some modification would be applied in order to get it running on OTC, as well as UnifiedLoadBalancer is used instead of the separate HAProxy instance.

* Note: For the sake of reliability in the cluster a 3 Master/3 ETCD nodes cluster will be used. For a simple sandbox cluster 1 Master/ETCD and 1-2 executor nodes can be used

## Requirements
You would need following to get up and running:

* A tenant on OTC with quotas allowing:
 * 9 Elastic Cloud Servers (ECS). 3 - Master, 3 - Infrastructure (Router), 3 - Executor
 * 1 Unified Load Balancer (ULB)
 * 1 Virtual Private Cloud (VPC)
 * 3 Security Groups (SG)
 * 1 KeyPair for the SSH access to the cluster nodes
 * Fedora Atomic image (private or public)
* Fully running DNS server, which will be handling cluster nodes (with private domain zone)
* Existing Jump host or VPN connection into the VPC
* OpenStackClient tool installed on the instance, which will be used to start instances

It is also assumed, that the VPC with enabled SNAT (required for getting internet access from the cluster nodes) and the subnet are already existing.

## Overview

### Hosts and DNS

It is very important to stress this, that fully working and correctly working DNS is crucial for the setup. Without it it would not be possible the cluster running. In this example we consider creating private zone for the openshift cluster `oc.example.com`. All nodes of the cluster will be running in the `internal.oc.example.com` subzone. The applications will be exposed into the `apps.oc.example.com` zone and be handled by the LoadBalances forwarding requests to the infra nodes (nodes running openshift router). Management console of the OpenShift will be available at `openshift.oc.example.com` and also handled by the LoadBalancer forwarding requests to the master nodes.

Configuration and handling of the DSN server is not given in details here (can be looked up in the RedHat Reference Architecture). An example DNS zone configuration will be given here:

```

$ORIGIN .
$TTL 300 ; 5 minutes
oc.example.com IN SOA ns-master.oc.example.com. dnsadmin.example.com. (
  2018030101 ; serial
  21600      ; refresh after 6 hours
  3660       ; retry after 1 hour
  604800     ; expire after 1 week
  86400      ; minimum TTL of 1 day
)
                NS ns-master.oc.exmaple.com.

$ORIGIN apps.oc.example.com.
*               A 192.168.0.79

$ORIGIN internal.oc.example.com.
master-0     IN A 192.168.0.234
master-1     IN A 192.168.0.194
master-2     IN A 192.168.0.211
app-node-0   IN A 192.168.0.244
app-node-1   IN A 192.168.0.94
app-node-2   IN A 192.168.0.30
infra-node-0 IN A 192.168.0.54
infra-node-1 IN A 192.168.0.69
infra-node-2 IN A 192.168.0.102

$ORIGIN oc.example.com.
ns-master  IN A 192.168.0.2
dns        IN CNAME ns-master
ns1        IN CNAME ns-master
bastion    IN A 192.168.0.81
www        IN A 192.168.0.79
openshift  IN A 192.168.0.79
```

* Note: proper IP addresses can be populated only after instances creation

DNS server handling this zone is configured to be a caching proxy and a master for the mentioned zone. In this way it can be ensured, that instances can be configured with only one NS and be able to resolve all queries. Forwarding to the authority server can be implemented as well, but not considered for the example simplicity.
This DNS server is also configured to be the default DNS server in the chosen subnet.

In this example following host names are used:

{:.table}
Node         | Description
------------ | -----------
master-{0-2} | Master nodes running OpenShift and Kubernetes Master and ETCD. Internally available under `master-{0-2}.internal.oc.example.com` address
infra-node-{0-2} | Infrastructure nodes. Those would be running OpenShift routers, which will forward INGRESS requests to the proper node running application Pod. Internally available under `infra-node-{0-2}.internal.oc.example.com`
app-node-{0-2} | Worker nodes. This nodes will be running application Pods. Internally available under `app-node-{0-2}.internal.oc.example.com`

### Deployment method

Official Openshift-ansible project will be used to deploy OpenShift cluster to the pre-provisioned instances. At the moment of writing project claims to be able to also provision resources itself, however this was not verified yet.

* Note: openshift-ansible/openstack claims, that currently only Keystone v2 is supported, therefore the verification is postponed for a later phase.

For the provisioning of the hosts some small bash scripts will be used. In a later phase a better approach of using i.e. Heat templates will be tried to provision the whole required infrastructure.

## Deployment

The following steps will be done for the OpenShift deployyment:

* Infrastructure preparation
 * SecurityGroups creation
 * External Docker Registry Volume creation
 * Instances deployment
 * LoadBalancer
 * DNS update
* OpenShift deployment using Ansible

### Infrastructure (Manual way)

As of writing only manual way is verified. Work on the automation is being done

#### Environment file

In order to ease the infrastructure preparation set of scripts is prepared. A small environment file containing configuration values will be also used.

```bash
export DOMAIN=internal.oc.example.com

export INTERNAL_NETWORK_NAME=4056b8b9-ff86-4cc0-8442-c75eba1034de # UUID of our VPC
export BASTION_SG_NAME=ag-bastion # Name of the bastion host security group
export MASTER_SG_NAME=ag-openshift-master # Name of the Master node security group
export NODE_SG_NAME=ag-openshift-node # Name of the worker node SG
export INFRA_SG_NAME=ag-openshift-infra # Name of the infra node SG
export KEYPAIR=ag-internal-KeyPair # KeyPair name

export HOST_VOLUME_SIZE=6 # Volume size for instances
export DOCKER_VOLUME_SIZE=15 # Size of the additional volume for docker storage
export ETCD_VOLUME_SIZE=25 # Size for the ETCD storage volume
export LOCAL_VOLUME_SIZE=30 # Additional OpenShift storage
export REGISTRY_VOLUME_SIZE=30 # Storage for the docker registry

export MASTER_IMAGE=Fedora-Atomic-27-180212.2 # Image for the master node
export NODE_IMAGE=Fedora-Atomic-27-180212.2 # image for the worker/infra node
export MASTER_FLAVOR=s2.xlarge.4 # Flavor for the master node
export NODE_FLAVOR=s2.large.2 # Flavor for the worker/infra node

alias openstack='openstack-3 --os-cloud devstack' # local alias to ensure `openstack` command connects to the correct cloud

if [ -z ${NET_ID} ]; then
  export NET_ID=$(openstack network show ${INTERNAL_NETWORK_NAME} -f value -c id) # cache network UUID
fi
```

In addition configuration of the OpenStackClient is required. It is not listed here and can be found [here](https://docs.openstack.org/python-openstackclient/latest/configuration/index.html)

#### Security Groups

Proper isolation of the cluster is always required in the cloud. Here we introduce 3 security groups for each used node type (master, infra, app)


##### Master SG

Security group for master nodes can be created using following script

```bash
shopt -s expand_aliases
source .env

openstack security group rule create \
    --ingress \
    --protocol tcp \
    --dst-port 2379:2380 \
    --src-group ${MASTER_SG_NAME} \
    ${MASTER_SG_NAME}

for PORT in 8053 24224;
do
  for PROTO in tcp udp;
  do
    openstack security group rule create \
      --ingress \
      --protocol $PROTO \
      --dst-port $PORT \
      --src-group ${NODE_SG_NAME} \
      ${MASTER_SG_NAME};
  done;
done
openstack security group rule create \
    --ingress \
    --protocol tcp \
    --dst-port 8443 \
    ${MASTER_SG_NAME}
```

##### Infra SG

Security group for infrastructure nodes can be created using following script

```bash
shopt -s expand_aliases
source .env

for PORT in 80 443 9200 9300;
do
  openstack security group rule create \
    --ingress \
    --protocol tcp \
    --dst-port $PORT \
    ${INFRA_SG_NAME};
done
```

##### Node SG

Security group for worker nodes can be created using following script

```bash
shopt -s expand_aliases
source .env

openstack security group rule create \
    --ingress \
    --protocol icmp \
    ${NODE_SG_NAME}

for SRC in ${BASTION_SG_NAME} ${NODE_SG_NAME};
do
  openstack security group rule create \
    --ingress \
    --protocol tcp \
    --dst-port 22 \
    --src-group $SRC \
    ${NODE_SG_NAME};
done

openstack security group rule create \
    --ingress \
    --protocol tcp \
    --dst-port 10250 \
    --src-group ${NODE_SG_NAME} \
    ${NODE_SG_NAME}

openstack security group rule create \
    --ingress \
    --protocol udp \
    --dst-port 4789 \
    --src-group ${NODE_SG_NAME} \
    ${NODE_SG_NAME}
```

#### Volume for the hosted Docker Registry

Openshift gives possibility to host an internal docker registry, which will be used to store application images. This is not absolutely required, but is highly recommended.
```bash
shopt -s expand_aliases
source .env

openstack volume create --size ${REGISTRY_VOLUME_SIZE} openshift-registry
```

* Note: The volume created here should not be initialized with the filesystem and should not be mounted anywhere. Otherwise deployment process will fail.

#### Instances deployment

Without any inputs, OpenStack Platform uses the nova instance name as the hostname and the domain as novalocal. The bastion host’s FQDN would result in bastion.novalocal. This would suffice if OpenStack Platform populated a DNS service with these names thus allowing each instance to find the IP addresses by name.

However, using the novalocal domain requires creating a zone in the external DNS service named novalocal. Since the OpenShift instance names are unique only within a project, this risks name collisions with other projects. To remedy this issue, creation of a subdomain for the internal network is implemented under the project domain, i.e. oc.example.com

##### cloud-init

Cloud-init will be used to initialize instances. For that a file for each instance should be created (TODO: automate this step)

* **Important**: it is absolutely required, that the host FQDN is properly set and corresponds to the DNS configuration. Further FQDN should also match instance name. If that is not met a very strange errors will happen during the deployment.


Master node cloud-init file:

```yaml
#cloud-config
cloud_config_modules:
- disk_setup
- mounts

hostname: <<PASTE HOSTNAME HERE>> i.e. master-0
fqdn: <<instance FQDN>> i.e. master-0.internal.oc.example.com

write_files:
  - path: "/etc/sysconfig/docker-storage-setup"
    permissions: "0644"
    owner: "root"
    content: |
      DEVS='/dev/vdb'
      VG=docker_vol
      DATA_SIZE=95%VG
      STORAGE_DRIVER=overlay2
      CONTAINER_ROOT_LV_NAME=dockerlv
      CONTAINER_ROOT_LV_MOUNT_PATH=/var/lib/docker
      CONTAINER_ROOT_LV_SIZE=100%FREE

fs_setup:
- label: emptydir
  filesystem: xfs
  device: /dev/vdc
  partition: auto
- label: etcd_storage
  filesystem: xfs
  device: /dev/vdd
  partition: auto

runcmd:
- mkdir -p /var/lib/origin/openshift.local.volumes
- mkdir -p /var/lib/etcd

mounts:
- [ /dev/vdc, /var/lib/origin/openshift.local.volumes, xfs, "defaults,gquota" ]
- [ /dev/vdd, /var/lib/etcd, xfs, "defaults" ]
```

Application and infra node cloud-init

```yaml
#cloud-config
cloud_config_modules:
- disk_setup
- mounts

hostname: <<PASTE HOSTNAME HERE>> i.e. infra-node-0
fqdn: <<instance FQDN>> i.e. infra-node-0.internal.oc.example.com

write_files:
  - path: "/etc/sysconfig/docker-storage-setup"
    permissions: "0644"
    owner: "root"
    content: |
      DEVS='/dev/vdb'
      VG=docker_vol
      DATA_SIZE=95%VG
      STORAGE_DRIVER=overlay2
      CONTAINER_ROOT_LV_NAME=dockerlv
      CONTAINER_ROOT_LV_MOUNT_PATH=/var/lib/docker
      CONTAINER_ROOT_LV_SIZE=100%FREE

fs_setup:
- label: emptydir
  filesystem: xfs
  device: /dev/vdc
  partition: auto

runcmd:
- mkdir -p /var/lib/origin/openshift.local.volumes

mounts:
- [ /dev/vdc, /var/lib/origin/openshift.local.volumes, xfs, "defaults,gquota" ]
```

Yaml files per each instances should be created using given templates and named with following pattern (where NUM stands for digit number 0-2):
* master-NUM.yaml
* infra-node-NUM.yaml
* app-node-NUM.yaml

##### Instances creation

Scripts here can be used to automatically start host instances

###### Masters

```bash
#!/bin/bash
# VERY IMPORTANT: hostname fqdn SHOULD match instance name when OpenStack connection is configured in the ansible
# K8/OS master-api starts with the name provided by cloudprovider
shopt -s expand_aliases
source .env

for node in master-{0..2};
do
  echo -e "Create volumes for ${node}.${DOMAIN} instance"
  VOLUME_UUID=$(openstack volume create --size ${HOST_VOLUME_SIZE} \
    --image ${MASTER_IMAGE} \
    --bootable \
    --property user=ag \
    ag_${node}_${DOMAIN} \
    -f value -c id)
  DOCKER_VOLUME_UUID=$(openstack volume create --size ${DOCKER_VOLUME_SIZE} \
    --property user=ag ag_docker_${node}_${DOMAIN} \
    -f value -c id)
  LOCAL_VOLUME_UUID=$(openstack volume create --size ${LOCAL_VOLUME_SIZE} \
    --property user=ag ag_local_${node}_${DOMAIN} \
    -f value -c id)
  ETCD_VOLUME_UUID=$(openstack volume create --size ${ETCD_VOLUME_SIZE} \
    --property user=ag ag_etcd_${node}_${DOMAIN} \
    -f value -c id)

  echo -e "VOLUME_UUID= ${VOLUME_UUID}"
  echo -e "DOCKER_VOLUME_UUID= ${DOCKER_VOLUME_UUID}"
  echo -e "LOCAL_VOLUME_UUID= ${LOCAL_VOLUME_UUID}"
  echo -e "ETCD_VOLUME_UUID= ${ETCD_VOLUME_UUID}"

  echo -e "Starting ${node}.${DOMAIN} instance"
  if [ -n "${DOCKER_VOLUME_UUID}" -a -n "${LOCAL_VOLUME_UUID}" -a -n "${ETCD_VOLUME_UUID}" ]; then
    openstack server create \
      --nic net-id=${NET_ID} \
      --flavor ${MASTER_FLAVOR} \
      --volume ${VOLUME_UUID} \
      --key-name ${KEYPAIR} \
      --security-group ${MASTER_SG_NAME} \
      --security-group ${NODE_SG_NAME} \
      --user-data=${node}.yaml \
      --block-device-mapping /dev/sdb=${DOCKER_VOLUME_UUID}:::true \
      --block-device-mapping /dev/sdc=${LOCAL_VOLUME_UUID}:::true \
      --block-device-mapping /dev/sdd=${ETCD_VOLUME_UUID}:::true \
      --property user=ag \
      ${node}.${DOMAIN};

    if [ $? -ne 0 ]; then
      echo "problem starting server. Aborting"
      exit 1
    fi
  else
    echo -e "Some of the volumes were not created. Aborting"
    echo -e "VOLUME_UUID= ${VOLUME_UUID}"
    echo -e "DOCKER_VOLUME_UUID= ${DOCKER_VOLUME_UUID}"
    echo -e "LOCAL_VOLUME_UUID= ${LOCAL_VOLUME_UUID}"
    echo -e "ETCD_VOLUME_UUID= ${ETCD_VOLUME_UUID}"
    exit 1
  fi
done
```

###### Infra nodes

```bash
#!/bin/bash

shopt -s expand_aliases
source .env

for node in infra-node-{0..2};
do
  echo -e "Create volumes for ${node}.${DOMAIN} instance"
  VOLUME_UUID=$(openstack volume create --size ${HOST_VOLUME_SIZE} \
    --image ${NODE_IMAGE} \
    --bootable \
    --property user=ag \
    ag_${node}_${DOMAIN} \
    -f value -c id)
  DOCKER_VOLUME_UUID=$(openstack volume create --size ${DOCKER_VOLUME_SIZE} \
    --property user=ag ag_docker_${node}_${DOMAIN} \
    -f value -c id)
  LOCAL_VOLUME_UUID=$(openstack volume create --size ${LOCAL_VOLUME_SIZE} \
    --property user=ag ag_local_${node}_${DOMAIN} \
    -f value -c id)

  echo -e "VOLUME_UUID= ${VOLUME_UUID}"
  echo -e "DOCKER_VOLUME_UUID= ${DOCKER_VOLUME_UUID}"
  echo -e "LOCAL_VOLUME_UUID= ${LOCAL_VOLUME_UUID}"

  echo -e "Starting ${node}.${DOMAIN} instance"
  if [ -n "${DOCKER_VOLUME_UUID}" -a -n "${LOCAL_VOLUME_UUID}" -a -n "${VOLUME_UUID}" ]; then
    openstack server create \
      --nic net-id=${NET_ID} \
      --flavor ${NODE_FLAVOR} \
      --volume ${VOLUME_UUID} \
      --key-name ${KEYPAIR} \
      --security-group ${INFRA_SG_NAME} \
      --security-group ${NODE_SG_NAME} \
      --user-data=${node}.yaml \
      --block-device-mapping /dev/sdb=${DOCKER_VOLUME_UUID}:::true \
      --block-device-mapping /dev/sdc=${LOCAL_VOLUME_UUID}:::true \
      --property user=ag \
      ${node}.${DOMAIN};

    if [ $? -ne 0 ]; then
      echo "problem starting server. Aborting"
      exit 1
    fi
  else
    echo -e "Some of the volumes were not created. Aborting"
    echo -e "VOLUME_UUID= ${VOLUME_UUID}"
    echo -e "DOCKER_VOLUME_UUID= ${DOCKER_VOLUME_UUID}"
    echo -e "LOCAL_VOLUME_UUID= ${LOCAL_VOLUME_UUID}"
    exit 1
  fi
done
```

###### Worker nodes

```bash
#!/bin/bash

shopt -s expand_aliases
source .env

for node in app-node-{0..2};
do
  echo -e "Create volumes for ${node}.${DOMAIN} instance"
  VOLUME_UUID=$(openstack volume create --size ${HOST_VOLUME_SIZE} \
    --image ${NODE_IMAGE} \
    --bootable \
    --property user=ag \
    ag_${node}_${DOMAIN} \
    -f value -c id)
  DOCKER_VOLUME_UUID=$(openstack volume create --size ${DOCKER_VOLUME_SIZE} \
    --property user=ag ag_docker_${node}_${DOMAIN} \
    -f value -c id)
  LOCAL_VOLUME_UUID=$(openstack volume create --size ${LOCAL_VOLUME_SIZE} \
    --property user=ag ag_local_${node}_${DOMAIN} \
    -f value -c id)

  echo -e "VOLUME_UUID= ${VOLUME_UUID}"
  echo -e "DOCKER_VOLUME_UUID= ${DOCKER_VOLUME_UUID}"
  echo -e "LOCAL_VOLUME_UUID= ${LOCAL_VOLUME_UUID}"
  echo -e "ETCD_VOLUME_UUID= ${ETCD_VOLUME_UUID}"

  echo -e "Starting ${node}.${DOMAIN} instance"
  if [ -n "${DOCKER_VOLUME_UUID}" -a -n "${LOCAL_VOLUME_UUID}" -a -n "${VOLUME_UUID}" ]; then
    openstack server create \
      --nic net-id=${NET_ID} \
      --flavor ${MASTER_FLAVOR} \
      --volume ${VOLUME_UUID} \
      --key-name ${KEYPAIR} \
      --security-group ${NODE_SG_NAME} \
      --user-data=${node}.yaml \
      --block-device-mapping /dev/sdb=${DOCKER_VOLUME_UUID}:::true \
      --block-device-mapping /dev/sdc=${LOCAL_VOLUME_UUID}:::true \
      --property user=ag \
      ${node}.${DOMAIN};

    if [ $? -ne 0 ]; then
      echo "problem starting server. Aborting"
      exit 1
    fi
  else
    echo -e "Some of the volumes was not created. Aborting"
    echo -e "VOLUME_UUID= ${VOLUME_UUID}"
    echo -e "DOCKER_VOLUME_UUID= ${DOCKER_VOLUME_UUID}"
    echo -e "LOCAL_VOLUME_UUID= ${LOCAL_VOLUME_UUID}"
    exit 1
  fi
done
```

After executing those scripts all 9 required instances should be created.

#### LoadBalancer

At this stage it is required to create load balancer and corresponding listeners, since during the OpenShift installation health checks and nodes availability is checked.

Currently Load balances is created via the GUI, but it is also possible to do this via OpenStackClient tool (TODO: do this)

* create the UnifiedLoadBalancer
* create rule for the admin interface
 * port 8443, health check: HTTPS with path '/healthz/ready'
 * add backend ECS (master instances) to the admin rule
* create rule for the port 80 router
  * port 80, health check: TCP
  * add backend ECS (infra instances) to the router:80 rule
* create rule for the port 443 router
  * port 443, health check: TCP
  * add backend ECS (infra instances) to the router:443 rule

#### DNS update

When the instances are running DNS should be updated with their internal IPs. After that ensure that instances are reachable from the host, where ansible installation will run (i.e. bastion) and that instances are able to resolve each other names.

In the DNS configuration point openshift.oc.example.com and \*.apps.oc.example.com to the IP address of the LoadBalancer

### OpenShift deployment

Since all instances are running, load balancer is configured and the DNS is responding properly OpenShift can be deployed.

Since ansible will be used a [repository](https://github.com/openshift/openshift-ansible/) should be checked out. It is required to prepare inventory file for the provisioned infrastructure.

#### Ansible inventory

```yaml
# example inventory
[OSEv3:children]
masters
etcd
nodes

# Set variables common for all OSEv3 hosts
[OSEv3:vars]
ansible_user=fedora
openshift_deployment_type=origin
openshift_release=v3.7
openshift_image_tag=v3.7.0
debug_level=2
ansible_become=true
console_port=8443
openshift_debug_level="{{site.lcb}}{{site.lcb}} debug_level {{site.rcb}}{{site.rcb}}"
openshift_node_debug_level="{{site.lcb}}{{site.lcb}} node_debug_level | default(debug_level, true) {{site.rcb}}{{site.rcb}}"
openshift_master_debug_level="{{site.lcb}}{{site.lcb}} master_debug_level | default(debug_level, true) {{site.rcb}}{{site.rcb}}"

openshift_master_identity_providers=[{'name': 'htpasswd_auth', 'login': 'true', 'challenge': 'true', 'kind': 'HTPasswdPasswordIdentityProvider', 'filename': '/etc/origin/master/htpasswd'}]
openshift_master_htpasswd_users={'user1': '$apr1$5a3/BgnO$5xx5sK0e.z1Hy207Yor8d/', 'user2': '$apr1$1oH1Pynz$0syN6XrNcltdKPHgf1JfJ0'}

openshift_master_access_token_max_seconds=2419201
openshift_hosted_router_replicas=3
openshift_hosted_registry_replicas=1
openshift_master_cluster_method=native
openshift_node_local_quota_per_fsgroup=512Mi

openshift_cloudprovider_kind=openstack
openshift_cloudprovider_openstack_auth_url="{{site.lcb}}{{site.lcb}} lookup('env','OS_AUTH_URL') {{site.rcb}}{{site.rcb}}"
openshift_cloudprovider_openstack_username= "{{site.lcb}}{{site.lcb}} lookup('env','OS_USERNAME') {{site.rcb}}{{site.rcb}}"
openshift_cloudprovider_openstack_password= "{{site.lcb}}{{site.lcb}} lookup('env','OS_PASSWORD') {{site.rcb}}{{site.rcb}}"
openshift_cloudprovider_openstack_tenant_name= "{{site.lcb}}{{site.lcb}} lookup('env','OS_TENANT_NAME') {{site.rcb}}{{site.rcb}}"
openshift_cloudprovider_openstack_project_name= "{{site.lcb}}{{site.lcb}} lookup('env','OS_PROJECT_NAME') {{site.rcb}}{{site.rcb}}"
openshift_cloudprovider_openstack_domain_name= "{{site.lcb}}{{site.lcb}} lookup('env','OS_USER_DOMAIN_NAME') {{site.rcb}}{{site.rcb}}"
openshift_cloudprovider_openstack_region= "{{site.lcb}}{{site.lcb}} lookup('env', 'OS_REGION_NAME') {{site.rcb}}{{site.rcb}}"

openshift_master_cluster_hostname=openshift.oc.example.com
openshift_master_cluster_public_hostname=openshift.oc.example.com
openshift_master_default_subdomain=apps.oc.example.com

openshift_install_examples=true

# registry
openshift_hosted_registry_storage_kind=openstack
openshift_hosted_registry_storage_access_modes=['ReadWriteOnce']
openshift_hosted_registry_storage_openstack_filesystem=ext4
openshift_hosted_registry_storage_openstack_volumeID=e8a14026-1e63-4488-bfe4-c514ff895882
openshift_hosted_registry_storage_volume_size=15Gi

# enable ntp on masters to ensure proper failover
openshift_clock_enabled=true

# Logging installation is not working at the moment
# related issue https://github.com/openshift/openshift-ansible/issues/4163
# openshift_logging_install_logging=true
# # openshift_logging_es_pvc_dynamic=true
# openshift_logging_storage_kind=dynamic
# openshift_logging_es_pvc_size=10Gi
# openshift_logging_es_cluster_size=3
# openshift_logging_es_nodeselector={"region":"infra"}
# openshift_logging_kibana_nodeselector={"region":"infra"}
# openshift_logging_curator_nodeselector={"region":"infra"}

# host group for masters
[masters]
master-0.internal.oc.example.com
master-1.internal.oc.example.com
master-2.internal.oc.example.com

# host group for etcd
[etcd]
master-0.internal.oc.example.com
master-1.internal.oc.example.com
master-2.internal.oc.example.com

# host group for nodes, includes region info
[nodes]
master-0.internal.oc.example.com openshift_hostname=master-0.internal.oc.example.com
master-1.internal.oc.example.com openshift_hostname=master-1.internal.oc.example.com
master-2.internal.oc.example.com openshift_hostname=master-2.internal.oc.example.com
app-node-0.internal.oc.example.com openshift_node_labels="{'role': 'app', 'region': 'primary'}" openshift_hostname=app-node-0.internal.oc.example.com
app-node-1.internal.oc.example.com openshift_node_labels="{'role': 'app', 'region': 'primary'}" openshift_hostname=app-node-1.internal.oc.example.com
app-node-2.internal.oc.example.com openshift_node_labels="{'role': 'app', 'region': 'primary'}" openshift_hostname=app-node-2.internal.oc.example.com
infra-node-0.internal.oc.example.com openshift_node_labels="{'region': 'infra'}" openshift_hostname=infra-node-0.internal.oc.example.com
infra-node-1.internal.oc.example.com openshift_node_labels="{'region': 'infra'}" openshift_hostname=infra-node-1.internal.oc.example.com
infra-node-2.internal.oc.example.com openshift_node_labels="{'region': 'infra'}" openshift_hostname=infra-node-2.internal.oc.example.com
```

In this inventory file following items are of importance:
* `ansible_user` is a user, which is able to SSH into the nodes
* `openshift_deployment_type` is the OpenShift type to deploy (origin or openshift-enterprise)
* `openshift_release` and `openshift_image_tag` are pointing to the openshift version to install
* `openshift_master_identity_providers` is a preconfigured identity provider to be used for users control. In this sample 2 users (`user1:user1`, `user2:user2`) are prepared with their salted passwords (`htpasswd -n`). LDAP is most likely to be chosen in an enterprise environment
* `openshift_cloudprovider_openstack\*` is the connection of OpenShift to the OpenStack resources. For example Cinder volumes would be automatically provisioned on the request of persistent volume. Here the values are taken from environment. **Please ensure the values are populated properly in the environment, where Ansible will be executed. Otherwise the deployment may fail of a corrupted environment will be provisioned**
* `openshift_hosted_registry_storage_\*` is a configuration of the prepared registry_storage. **Remember, that volume should not contain FS or be mounted to any instance. Otherwise recovery is currently not transparent**
* `openshift_logging\*` installation of logging is not working properly at the moment of writing. It might depend on Python3 (required for Fedora Atomic host) or the chosen logging type. Analysis is currently in progress.
* `[nodes]`, `[masters]`, `[etcd]` is the configuration of our inventory hosts. **openshift_node_labels="{'region': 'infra'}" is a default node label for OpenShift where to deploy router to**
* Further details on particular variables and other can be found [here](https://docs.openshift.org/latest/install_config/install/advanced_install.html)

#### Ansible Configuration

It is required to configure Ansible to use our private key in order to connect to our instance. For that in the `[defaults]` section of the ansible.cfg file add following line:
```yaml
private_key_file=<<<PATH TO ACCESS PEM KEY>>>
```

### Deployment

On the host where deployment (ansible) will be triggered and the openshift-ansible repo checked out execute the following command:

```bash
ansible-playbook -i PATH_TO_OUR_INVENTORY -e 'ansible_python_interpeter=/usr/bin/python3' playbooks/deploy_cluster.yml
```

* **Note:** forcing ansible to use python3 on the target hosts is required option for using Fedora Atomic images. Otherwise the deployment will fail.

The process takes some time (at least 10 minutes). If an error occured during the process it is possible to restart process by simply repeating the command (previously of course fixing the cause).

When the process finished successfully a cluster deployment is complete. The verification may be done

### Verification

The easiest way to verify OpenShift installation is following with the browser to the admin console of the [OS](https://openshift.oc.example.com:8443/console). User configured in the ansible inventory (i.e. `user1:user1`) can be used to login to the console and create any application. If the application is created successfully, deployed and accessible - the installation may be considered completed. Of course cluster administration, users creation and so on should be done, but it is not part of this document. Please refer to the [OpenShift documentation](docs.openshift.org) to get familiar with OpenShift administration and usage.
