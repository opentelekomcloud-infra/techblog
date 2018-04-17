---
layout: post
title:  "Get OpenShift Origin 3.7 on Fedora 27 Atomic running on Open Telekom Cloud"
date:   2018-04-17 08:00:00 +0100
categories: otc, blueprints
author: A. Goncharov
excerpt_separator: <!--excerpt-->
---

Is it possible to get OpenShift Origin running on Open Telekom Cloud? The answer is yes, it is. Our tested [blueprint]({{ site.baseurl }}{% link _blueprints/2018-03-23-openshift-origin-fedora-atomic.md %}) shows how this can be done.

<!--excerpt-->

As a basis of this blueprint we take the RedHat reference architecture of running OpenShift on Openstack. Some modifications are done to add features of OTC like Load balancer (instead of a separate HA-Proxy instance/s) or to bypass issues. An OpenShift cluster will contain the following items:
* VPC (or network and router in a native OpenStack terminology)
* Bastion server (some call it jump host) to access cluster environment without Public IP
* Private DNS servers. OpenShift and Kubernetes absolutely require fully functioning domain name resolution for each node in the cluster
* Some (configurable) amount of OpenShift master nodes (with ETCD service)
* configurable amount of the worker (compute or pod) nodes
* configurable amount of the infra (router) nodes

In a blueprint we walk you through all the required steps required to get this running on OTC smoothly starting from 0 to have a full functioning cluster in the own VPC).

The blueprint should not be considered created and forgotten, it will be updated periodically when some steps are being automated (currently WIP) or the new OpenShift version is released.

Please follow details [here]({{ site.baseurl }}{% link _blueprints/2018-03-23-openshift-origin-fedora-atomic.md %}).
